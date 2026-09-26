import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { growthStatus } from "@/lib/growth";
import { getGrowthStageRules } from "@/lib/growth-rules-db";

/** How many "needs attention" items a farm currently has — pregnancies due
 * within 30 days, medical follow-ups due within 14 days, feed below its
 * reorder point, a per-pig pen not logged for feeding today, a bulk pen
 * due or overdue for its next top-up, and pigs that are behind/overdue on
 * growth-stage weight or have aged into a new stage. Mirrors the
 * dashboard's own task list thresholds; used by the topbar's notification
 * bell so it doesn't need the full record sets. */
export async function needsAttentionCount(farmId: string): Promise<number> {
  const [breeding, medical, feed, pigs, penFeedPlans, feedLogs, rules] = await Promise.all([
    db.select().from(schema.breedingRecords).where(eq(schema.breedingRecords.farmId, farmId)),
    db.select().from(schema.medicalRecords).where(eq(schema.medicalRecords.farmId, farmId)),
    db.select().from(schema.feedInventory).where(eq(schema.feedInventory.farmId, farmId)),
    db.select().from(schema.pigs).where(eq(schema.pigs.farmId, farmId)),
    db.select().from(schema.penFeedPlans).where(eq(schema.penFeedPlans.farmId, farmId)),
    db.select().from(schema.feedLogs).where(eq(schema.feedLogs.farmId, farmId)),
    getGrowthStageRules(),
  ]);
  const now = Date.now();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  let count = 0;
  for (const b of breeding) {
    if (b.actualFarrowDate) continue;
    if ((b.expectedFarrowDate.getTime() - now) / 86400000 <= 30) count++;
  }
  for (const m of medical) {
    if (!m.nextDueDate) continue;
    if ((m.nextDueDate.getTime() - now) / 86400000 <= 14) count++;
  }
  for (const f of feed) {
    if (f.stockKg < f.reorderLevelKg) count++;
  }
  for (const p of pigs) {
    const g = growthStatus(p, rules);
    if (!g) continue;
    if (g.label !== "On track") count++;
    else if (g.stageMismatch) count++;
  }

  const feedPens = new Map<string, typeof pigs>();
  for (const p of pigs) {
    const pen = p.pen || "Unassigned";
    if (!feedPens.has(pen)) feedPens.set(pen, []);
    feedPens.get(pen)!.push(p);
  }
  const bulkPlanByPen = new Map(penFeedPlans.map((p) => [p.pen, p]));
  for (const [penName, penPigs] of feedPens) {
    const plan = bulkPlanByPen.get(penName);
    if (plan) {
      const daysLeft = plan.durationDays - Math.round((today.getTime() - plan.startDate.getTime()) / 86400000);
      if (daysLeft <= 0) count++;
    } else {
      const onPlan = penPigs.some((p) => p.feedRation && (p.dailyFeedKg ?? 0) > 0);
      if (!onPlan) continue;
      const loggedToday = feedLogs.some(
        (l) => l.pen === penName && l.source === "calendar" && l.date.toISOString().slice(0, 10) === todayStr
      );
      if (!loggedToday) count++;
    }
  }

  return count;
}
