"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

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

  const liveWeightKg = num(formData, "liveWeightKg") || null;
  const carcassWeightKg = num(formData, "carcassWeightKg") || null;
  const pricePerUnit = num(formData, "pricePerUnit");
  const basisWeight = carcassWeightKg ?? liveWeightKg ?? 0;
  const revenue = pricePerUnit * basisWeight;

  await db.insert(schema.sales).values({
    farmId: session.farmId,
    date: new Date(date),
    pigTag: str(formData, "pigTag") || null,
    channel: str(formData, "channel") || "live",
    liveWeightKg,
    carcassWeightKg,
    pricePerUnit,
    revenue,
    buyer: str(formData, "buyer") || null,
  });

  revalidatePath("/app/sales");
  revalidatePath("/app");
  redirect("/app/sales");
}

export async function deleteSaleAction(formData: FormData) {
  const session = await requireManagerSession();
  const id = str(formData, "id");
  await db.delete(schema.sales).where(and(eq(schema.sales.farmId, session.farmId), eq(schema.sales.id, id)));
  revalidatePath("/app/sales");
  redirect("/app/sales");
}
