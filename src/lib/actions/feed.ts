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
  if (session.role === "worker") redirect("/app/feed");
  return session;
}

export async function createRationAction(formData: FormData) {
  const session = await requireManagerSession();
  const feedType = str(formData, "feedType");
  if (!feedType) redirect("/app/feed?error=" + encodeURIComponent("Name the ration."));

  const [clash] = await db
    .select()
    .from(schema.feedInventory)
    .where(and(eq(schema.feedInventory.farmId, session.farmId), eq(schema.feedInventory.feedType, feedType)))
    .limit(1);
  if (clash) redirect("/app/feed?error=" + encodeURIComponent("That ration already exists."));

  await db.insert(schema.feedInventory).values({
    farmId: session.farmId,
    feedType,
    stockKg: num(formData, "stockKg"),
    reorderLevelKg: num(formData, "reorderLevelKg"),
    costPerKg: num(formData, "costPerKg"),
  });
  revalidatePath("/app/feed");
  redirect("/app/feed");
}

export async function updateRationAction(formData: FormData) {
  const session = await requireManagerSession();
  const id = str(formData, "id");
  await db
    .update(schema.feedInventory)
    .set({
      stockKg: num(formData, "stockKg"),
      reorderLevelKg: num(formData, "reorderLevelKg"),
      costPerKg: num(formData, "costPerKg"),
    })
    .where(and(eq(schema.feedInventory.farmId, session.farmId), eq(schema.feedInventory.id, id)));
  revalidatePath("/app/feed");
  redirect("/app/feed");
}

export async function logFeedMovementAction(formData: FormData) {
  const session = await requireManagerSession();
  const feedType = str(formData, "feedType");
  const direction = str(formData, "direction") === "usage" ? "usage" : "purchase";
  const quantityKg = num(formData, "quantityKg");
  const date = str(formData, "date");
  if (!feedType || quantityKg <= 0 || !date) redirect("/app/feed?error=" + encodeURIComponent("Ration, date and a positive quantity are required."));

  const [inv] = await db
    .select()
    .from(schema.feedInventory)
    .where(and(eq(schema.feedInventory.farmId, session.farmId), eq(schema.feedInventory.feedType, feedType)))
    .limit(1);

  await db.insert(schema.feedLogs).values({
    farmId: session.farmId,
    feedType,
    direction,
    quantityKg,
    costTotal: num(formData, "costTotal"),
    date: new Date(date),
    notes: str(formData, "notes") || null,
    source: "manual",
  });

  if (inv) {
    const delta = direction === "purchase" ? quantityKg : -quantityKg;
    await db
      .update(schema.feedInventory)
      .set({ stockKg: Math.max(0, inv.stockKg + delta) })
      .where(eq(schema.feedInventory.id, inv.id));
  }

  revalidatePath("/app/feed");
  revalidatePath("/app");
  redirect("/app/feed");
}

/** Deleting a feed movement must undo the stock change it made, so
 * inventory on hand ends up exactly where it was before that movement was
 * ever logged. */
export async function deleteFeedLogAction(formData: FormData) {
  const session = await requireManagerSession();
  const id = str(formData, "id");
  const [log] = await db
    .select()
    .from(schema.feedLogs)
    .where(and(eq(schema.feedLogs.farmId, session.farmId), eq(schema.feedLogs.id, id)))
    .limit(1);
  if (log) {
    const [inv] = await db
      .select()
      .from(schema.feedInventory)
      .where(and(eq(schema.feedInventory.farmId, session.farmId), eq(schema.feedInventory.feedType, log.feedType)))
      .limit(1);
    if (inv) {
      const delta = log.direction === "purchase" ? -log.quantityKg : log.quantityKg;
      await db
        .update(schema.feedInventory)
        .set({ stockKg: Math.max(0, inv.stockKg + delta) })
        .where(eq(schema.feedInventory.id, inv.id));
    }
    await db.delete(schema.feedLogs).where(eq(schema.feedLogs.id, id));
  }
  revalidatePath("/app/feed");
  redirect("/app/feed");
}

/** Assigns a ration + daily amount to every pig in a pen — powers the
 * feeding calendar. Manager/owner only; Workers can view the calendar but
 * not edit assignments. */
export async function assignPenFeedAction(formData: FormData) {
  const session = await requireManagerSession();
  const pigIds = formData.getAll("pigId").map(String);
  const rations = formData.getAll("feedRation").map(String);
  const amounts = formData.getAll("dailyFeedKg").map(String);

  for (let i = 0; i < pigIds.length; i++) {
    const ration = rations[i]?.trim() || null;
    const amount = amounts[i] === "" || amounts[i] == null ? null : Number(amounts[i]);
    await db
      .update(schema.pigs)
      .set({ feedRation: ration, dailyFeedKg: Number.isFinite(amount as number) ? amount : null })
      .where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.id, pigIds[i])));
  }

  revalidatePath("/app/feed");
  redirect("/app/feed");
}

export async function logCalendarFeedingAction(formData: FormData) {
  const session = await requireManagerSession();
  const rows = JSON.parse(String(formData.get("rows") || "[]")) as { feedType: string; quantityKg: number; costTotal: number }[];
  const today = new Date();

  for (const row of rows) {
    if (!row.feedType || row.quantityKg <= 0) continue;
    const [inv] = await db
      .select()
      .from(schema.feedInventory)
      .where(and(eq(schema.feedInventory.farmId, session.farmId), eq(schema.feedInventory.feedType, row.feedType)))
      .limit(1);
    await db.insert(schema.feedLogs).values({
      farmId: session.farmId,
      feedType: row.feedType,
      direction: "usage",
      quantityKg: row.quantityKg,
      costTotal: row.costTotal,
      date: today,
      source: "calendar",
    });
    if (inv) {
      await db
        .update(schema.feedInventory)
        .set({ stockKg: Math.max(0, inv.stockKg - row.quantityKg) })
        .where(eq(schema.feedInventory.id, inv.id));
    }
  }

  revalidatePath("/app/feed");
  redirect("/app/feed");
}
