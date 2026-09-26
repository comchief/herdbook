/** Shared math for how fast a pen — or the farm as a whole — is eating
 * through a ration, kept in one place so the feeding calendar's display,
 * the "Log feeding" action, and the dashboard's "feed runs out in" tile
 * can't drift apart from computing it three different ways. */

export type FeedPig = { feedRation: string | null; dailyFeedKg: number | null };
export type BulkPlanLite = { feedType: string; totalWeightKg: number; durationDays: number };

/** For one pen's pigs: each distinct ration they're on and the summed daily
 * kg for that ration. A pen is usually on one ration, but pigs within it
 * can be split across a few (see the "Mixed" case on the feeding
 * calendar) — logging feeding for the pen means logging each of those
 * separately, since they draw down different inventory rows. Pigs with no
 * ration or no amount set aren't on a plan and are left out entirely. */
export function perPigRationTotals(pigs: FeedPig[]): { feedType: string; dailyKg: number }[] {
  const totals = new Map<string, number>();
  for (const p of pigs) {
    if (p.feedRation && (p.dailyFeedKg ?? 0) > 0) {
      totals.set(p.feedRation, (totals.get(p.feedRation) ?? 0) + p.dailyFeedKg!);
    }
  }
  return [...totals.entries()].map(([feedType, dailyKg]) => ({ feedType, dailyKg }));
}

/** Farm-wide daily consumption per ration, in canonical kg/day — every
 * per-pig pig's daily amount plus every bulk pen's total/duration
 * daily-equivalent, summed by feedType regardless of which pen it's in.
 * This is the rate the "feed runs out in" dashboard tile divides stock on
 * hand by; it deliberately ignores which pen is using a ration since
 * inventory itself isn't tracked per pen. */
export function dailyConsumptionByRation(pigs: FeedPig[], bulkPlans: BulkPlanLite[]): Map<string, number> {
  const rates = new Map<string, number>();
  for (const p of pigs) {
    if (p.feedRation && (p.dailyFeedKg ?? 0) > 0) {
      rates.set(p.feedRation, (rates.get(p.feedRation) ?? 0) + p.dailyFeedKg!);
    }
  }
  for (const plan of bulkPlans) {
    const rate = plan.totalWeightKg / Math.max(plan.durationDays, 1);
    rates.set(plan.feedType, (rates.get(plan.feedType) ?? 0) + rate);
  }
  return rates;
}
