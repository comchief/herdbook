"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { getFarmUnit } from "@/lib/gate";
import { displayToKg, displayCostToKg, fmtWeight } from "@/lib/units";
import { perPigRationTotals } from "@/lib/feed-consumption";
import { logActivity } from "@/lib/activity";

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

  const unit = await getFarmUnit(session.farmId);
  const stockKg = displayToKg(num(formData, "stockKg"), unit);
  await db.insert(schema.feedInventory).values({
    farmId: session.farmId,
    feedType,
    stockKg,
    reorderLevelKg: displayToKg(num(formData, "reorderLevelKg"), unit),
    costPerKg: displayCostToKg(num(formData, "costPerKg"), unit),
  });
  await logActivity(session, "Added feed ration", `${feedType} — starting stock ${fmtWeight(stockKg, unit, 0)}`, "/app/feed");
  revalidatePath("/app/feed");
  redirect("/app/feed");
}

export async function updateRationAction(formData: FormData) {
  const session = await requireManagerSession();
  const id = str(formData, "id");
  const unit = await getFarmUnit(session.farmId);
  const [existing] = await db
    .select()
    .from(schema.feedInventory)
    .where(and(eq(schema.feedInventory.farmId, session.farmId), eq(schema.feedInventory.id, id)))
    .limit(1);
  const stockKg = displayToKg(num(formData, "stockKg"), unit);
  const reorderLevelKg = displayToKg(num(formData, "reorderLevelKg"), unit);
  await db
    .update(schema.feedInventory)
    .set({
      stockKg,
      reorderLevelKg,
      costPerKg: displayCostToKg(num(formData, "costPerKg"), unit),
    })
    .where(and(eq(schema.feedInventory.farmId, session.farmId), eq(schema.feedInventory.id, id)));
  if (existing) {
    await logActivity(
      session,
      "Updated feed ration",
      `${existing.feedType} — stock ${fmtWeight(stockKg, unit, 0)}, reorder at ${fmtWeight(reorderLevelKg, unit, 0)}`,
      "/app/feed"
    );
  }
  revalidatePath("/app/feed");
  redirect("/app/feed");
}

export async function logFeedMovementAction(formData: FormData) {
  const session = await requireManagerSession();
  const feedType = str(formData, "feedType");
  const direction = str(formData, "direction") === "usage" ? "usage" : "purchase";
  const unit = await getFarmUnit(session.farmId);
  const quantityKg = displayToKg(num(formData, "quantityKg"), unit);
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

  await logActivity(
    session,
    "Logged feed movement",
    `${direction === "purchase" ? "Purchased" : "Used"} ${fmtWeight(quantityKg, unit, 0)} of ${feedType}`,
    "/app/feed"
  );

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
  const unit = await getFarmUnit(session.farmId);
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
    await logActivity(session, "Deleted feed movement", `${log.direction === "purchase" ? "Purchase" : "Usage"} of ${fmtWeight(log.quantityKg, unit, 0)} ${log.feedType}`, "/app/feed");
  }
  revalidatePath("/app/feed");
  redirect("/app/feed");
}

const DURATION_UNIT_DAYS: Record<string, number> = { days: 1, weeks: 7, months: 30.44 };

/** Assigns feeding for a whole pen — either per-pig daily amounts (powers
 * the feeding calendar's per-pig sum) or a single bulk/ad-lib allowance for
 * the pen as a whole (a pen_feed_plans row; see schema.ts). Manager/owner
 * only; Workers can view the calendar but not edit assignments.
 *
 * The two modes are mutually exclusive per pen: saving "bulk" clears every
 * pig in the pen's own feedRation/dailyFeedKg (so switching back to
 * per-pig later starts from a blank slate instead of silently reusing
 * whatever was set before bulk feeding began), and saving "per-pig" deletes
 * any existing bulk plan for that pen (so it stops being treated as
 * bulk-fed). */
export async function assignPenFeedAction(formData: FormData) {
  const session = await requireManagerSession();
  const pen = str(formData, "pen");
  const mode = str(formData, "mode") === "bulk" ? "bulk" : "per-pig";
  const pigIds = formData.getAll("pigId").map(String);
  const unit = await getFarmUnit(session.farmId);

  if (mode === "bulk") {
    const feedType = str(formData, "bulkFeedType");
    const totalWeight = num(formData, "bulkTotalWeight");
    const durationValue = num(formData, "bulkDurationValue");
    const durationUnit = str(formData, "bulkDurationUnit");
    const daysPerUnit = DURATION_UNIT_DAYS[durationUnit] ?? 1;
    if (!feedType || totalWeight <= 0 || durationValue <= 0) {
      redirect("/app/feed?error=" + encodeURIComponent("Ration, total weight and a duration are required for bulk feeding."));
    }

    await db
      .insert(schema.penFeedPlans)
      .values({
        farmId: session.farmId,
        pen,
        feedType,
        totalWeightKg: displayToKg(totalWeight, unit),
        durationValue,
        durationUnit,
        durationDays: durationValue * daysPerUnit,
        startDate: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.penFeedPlans.farmId, schema.penFeedPlans.pen],
        set: {
          feedType,
          totalWeightKg: displayToKg(totalWeight, unit),
          durationValue,
          durationUnit,
          durationDays: durationValue * daysPerUnit,
          startDate: new Date(),
          updatedAt: new Date(),
        },
      });

    for (const pigId of pigIds) {
      await db
        .update(schema.pigs)
        .set({ feedRation: null, dailyFeedKg: null })
        .where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.id, pigId)));
    }

    await logActivity(
      session,
      "Assigned bulk feeding",
      `${pen} — ${feedType}, ${fmtWeight(displayToKg(totalWeight, unit), unit, 0)} every ${durationValue % 1 === 0 ? durationValue.toFixed(0) : durationValue.toFixed(1)} ${durationUnit}`,
      "/app/feed"
    );
  } else {
    const rations = formData.getAll("feedRation").map(String);
    const amounts = formData.getAll("dailyFeedKg").map(String);

    for (let i = 0; i < pigIds.length; i++) {
      const ration = rations[i]?.trim() || null;
      const rawAmount = amounts[i] === "" || amounts[i] == null ? null : Number(amounts[i]);
      const amount = rawAmount !== null && Number.isFinite(rawAmount) ? displayToKg(rawAmount, unit) : null;
      await db
        .update(schema.pigs)
        .set({ feedRation: ration, dailyFeedKg: amount })
        .where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.id, pigIds[i])));
    }

    await db.delete(schema.penFeedPlans).where(and(eq(schema.penFeedPlans.farmId, session.farmId), eq(schema.penFeedPlans.pen, pen)));

    await logActivity(session, "Assigned per-pig feeding", `${pen} — ${pigIds.length} pig${pigIds.length === 1 ? "" : "s"}`, "/app/feed");
  }

  revalidatePath("/app/feed");
  redirect("/app/feed");
}

/** Pigs belonging to one pen, including the "Unassigned" pseudo-pen the
 * feeding calendar groups pigs with no pen into (see src/app/app/feed/
 * page.tsx) — that group has no single literal pen value in the DB, so it
 * has to be matched as null-or-blank rather than by name. */
async function pigsInPen(farmId: string, pen: string) {
  return pen === "Unassigned"
    ? db.select().from(schema.pigs).where(and(eq(schema.pigs.farmId, farmId), or(isNull(schema.pigs.pen), eq(schema.pigs.pen, ""))))
    : db.select().from(schema.pigs).where(and(eq(schema.pigs.farmId, farmId), eq(schema.pigs.pen, pen)));
}

async function deductInventory(farmId: string, feedType: string, quantityKg: number) {
  const [inv] = await db
    .select()
    .from(schema.feedInventory)
    .where(and(eq(schema.feedInventory.farmId, farmId), eq(schema.feedInventory.feedType, feedType)))
    .limit(1);
  if (inv) {
    await db
      .update(schema.feedInventory)
      .set({ stockKg: Math.max(0, inv.stockKg - quantityKg) })
      .where(eq(schema.feedInventory.id, inv.id));
  }
  return inv;
}

/** The feeding calendar's "Log feeding" button — confirms feeding actually
 * happened for one pen and records the usage against inventory. Open to
 * any signed-in role, including Workers: they're the ones doing the
 * feeding day to day, and this is a same-day confirmation, not a change to
 * how the pen is fed (that's still Assign feeding, manager-only).
 *
 * Bulk-fed pens (a pen_feed_plans row exists) log the *entire* total in
 * one go — that's how bulk feeding actually happens, a self-feeder gets
 * topped up all at once — and resetting startDate to today restarts the
 * "due again in N days" cycle the feeding calendar and dashboard both read
 * off of. Per-pig pens log each distinct ration the pen's pigs are on
 * (usually one, occasionally a "Mixed" pen's few) for just today, and
 * refuse a second log for the same pen on the same day so double-clicking
 * doesn't double-deduct inventory. */
export async function logPenFeedingAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");
  const pen = String(formData.get("pen") || "").trim();
  if (!pen) redirect("/app/feed");

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const unit = await getFarmUnit(session.farmId);

  const [plan] = await db
    .select()
    .from(schema.penFeedPlans)
    .where(and(eq(schema.penFeedPlans.farmId, session.farmId), eq(schema.penFeedPlans.pen, pen)))
    .limit(1);

  if (plan) {
    const inv = await deductInventory(session.farmId, plan.feedType, plan.totalWeightKg);
    await db.insert(schema.feedLogs).values({
      farmId: session.farmId,
      feedType: plan.feedType,
      direction: "usage",
      quantityKg: plan.totalWeightKg,
      costTotal: inv ? plan.totalWeightKg * inv.costPerKg : 0,
      date: today,
      pen,
      source: "calendar",
    });
    await db.update(schema.penFeedPlans).set({ startDate: today, updatedAt: today }).where(eq(schema.penFeedPlans.id, plan.id));
    await logActivity(session, "Logged feeding", `${pen} — topped up ${fmtWeight(plan.totalWeightKg, unit, 0)} of ${plan.feedType} (bulk)`, "/app/feed");
  } else {
    const existingToday = await db
      .select()
      .from(schema.feedLogs)
      .where(and(eq(schema.feedLogs.farmId, session.farmId), eq(schema.feedLogs.pen, pen), eq(schema.feedLogs.source, "calendar")))
      .then((rows) => rows.some((r) => r.date.toISOString().slice(0, 10) === todayStr));
    if (existingToday) redirect("/app/feed?error=" + encodeURIComponent("Already logged for this pen today."));

    const pigs = await pigsInPen(session.farmId, pen);
    const totals = perPigRationTotals(pigs);
    if (totals.length === 0) redirect("/app/feed?error=" + encodeURIComponent("This pen has no feeding plan to log."));

    for (const { feedType, dailyKg } of totals) {
      const inv = await deductInventory(session.farmId, feedType, dailyKg);
      await db.insert(schema.feedLogs).values({
        farmId: session.farmId,
        feedType,
        direction: "usage",
        quantityKg: dailyKg,
        costTotal: inv ? dailyKg * inv.costPerKg : 0,
        date: today,
        pen,
        source: "calendar",
      });
    }

    await logActivity(
      session,
      "Logged feeding",
      `${pen} — ${totals.map((t) => `${fmtWeight(t.dailyKg, unit, 0)} ${t.feedType}`).join(", ")}`,
      "/app/feed"
    );
  }

  revalidatePath("/app/feed");
  revalidatePath("/app");
  redirect("/app/feed?logged=1");
}
