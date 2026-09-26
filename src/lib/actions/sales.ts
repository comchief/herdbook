"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { getFarmUnit, getFarmCurrency } from "@/lib/gate";
import { displayToKg, displayCostToKg } from "@/lib/units";
import { logActivity } from "@/lib/activity";
import { fmtMoney } from "@/lib/currency";

function str(fd: FormData, key: string) {
  return String(fd.get(key) || "").trim();
}
function num(fd: FormData, key: string): number {
  const n = Number(fd.get(key));
  return Number.isFinite(n) ? n : 0;
}

async function requireManagerSession() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role === "worker") redirect("/app");
  return session;
}

export async function createSaleAction(formData: FormData) {
  const session = await requireManagerSession();
  const date = str(formData, "date");
  if (!date) redirect("/app/sales?error=" + encodeURIComponent("Date is required."));

  // Compute revenue from the raw, consistent display-unit values first —
  // multiplying price-per-unit by weight is unit-invariant as long as both
  // operands are in the same unit, so this stays correct regardless of the
  // farm's chosen display unit. Only afterward do we convert the individual
  // fields to canonical kg-based storage.
  const liveWeightInput = num(formData, "liveWeightKg") || null;
  const carcassWeightInput = num(formData, "carcassWeightKg") || null;
  const pricePerUnit = num(formData, "pricePerUnit");
  const basisWeight = carcassWeightInput ?? liveWeightInput ?? 0;
  const revenue = pricePerUnit * basisWeight;

  const unit = await getFarmUnit(session.farmId);
  const liveWeightKg = liveWeightInput === null ? null : displayToKg(liveWeightInput, unit);
  const carcassWeightKg = carcassWeightInput === null ? null : displayToKg(carcassWeightInput, unit);
  const pricePerKg = displayCostToKg(pricePerUnit, unit);

  const pigTag = str(formData, "pigTag") || null;
  const channel = str(formData, "channel") || "live";
  await db.insert(schema.sales).values({
    farmId: session.farmId,
    date: new Date(date),
    pigTag,
    channel,
    liveWeightKg,
    carcassWeightKg,
    pricePerUnit: pricePerKg,
    revenue,
    buyer: str(formData, "buyer") || null,
  });

  const currency = await getFarmCurrency(session.farmId);
  await logActivity(
    session,
    "Logged a sale",
    `${pigTag ? `${pigTag} — ` : ""}${channel} sale, ${fmtMoney(revenue, currency)}`,
    "/app/sales"
  );

  revalidatePath("/app/sales");
  revalidatePath("/app");
  redirect("/app/sales");
}

export async function deleteSaleAction(formData: FormData) {
  const session = await requireManagerSession();
  const id = str(formData, "id");
  const [sale] = await db.select().from(schema.sales).where(and(eq(schema.sales.farmId, session.farmId), eq(schema.sales.id, id))).limit(1);
  await db.delete(schema.sales).where(and(eq(schema.sales.farmId, session.farmId), eq(schema.sales.id, id)));
  if (sale) {
    const currency = await getFarmCurrency(session.farmId);
    await logActivity(session, "Deleted a sale", `${sale.pigTag ? `${sale.pigTag} — ` : ""}${sale.channel} sale, ${fmtMoney(sale.revenue, currency)}`, "/app/sales");
  }
  revalidatePath("/app/sales");
  redirect("/app/sales");
}
