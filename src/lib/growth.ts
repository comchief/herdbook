/** Growth-progress tracking for non-breeding pigs (piglet/weaner/grower/
 * finisher). Compares actual current weight against a straight-line
 * expectation from birth (0kg) to the target weight at the target age, then
 * classifies the pig as on track, behind schedule, or overdue. Breeding
 * stock, and any pig missing a target or an age reference, has no growth
 * status (the UI shows a dash for those).
 *
 * Age comes from dob when known; otherwise acquiredDate is used as a
 * fallback reference point (flagged as approximate by the caller, since it
 * measures time-on-farm rather than true age). */

export type PigForGrowth = {
  status: string;
  dob: Date | null;
  acquiredDate: Date | null;
  currentWeightKg: number;
  targetWeightKg: number | null;
  targetMonths: number | null;
};

export type GrowthStatus = {
  label: "On track" | "Behind" | "Overdue";
  pct: number;
  cls: "good" | "warn" | "critical";
} | null;

const GROWTH_ELIGIBLE = new Set(["piglet", "weaner", "grower", "finisher"]);
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

export function ageMonthsOf(pig: { dob: Date | null; acquiredDate: Date | null }): number | null {
  const ref = pig.dob ?? pig.acquiredDate;
  if (!ref) return null;
  return (Date.now() - ref.getTime()) / MS_PER_MONTH;
}

export function growthStatus(pig: PigForGrowth): GrowthStatus {
  if (!GROWTH_ELIGIBLE.has(pig.status)) return null;
  if (!pig.targetWeightKg || !pig.targetMonths || pig.targetMonths <= 0) return null;
  const ageMonths = ageMonthsOf(pig);
  if (ageMonths === null) return null;

  const expected = Math.min(pig.targetWeightKg, pig.targetWeightKg * (ageMonths / pig.targetMonths));
  if (expected <= 0) return null;
  const ratio = pig.currentWeightKg / expected;

  if (ratio >= 0.97) {
    return { label: "On track", pct: Math.round(Math.min(ratio, 1.5) * 100), cls: "good" };
  }
  if (ageMonths >= pig.targetMonths) {
    const pct = Math.round((1 - pig.currentWeightKg / pig.targetWeightKg) * 100);
    return { label: "Overdue", pct: Math.max(pct, 1), cls: "critical" };
  }
  const pct = Math.round((1 - ratio) * 100);
  return { label: "Behind", pct: Math.max(pct, 1), cls: "critical" };
}

/** Fuller breakdown for the "Time to market" card on a pig's profile page —
 * same eligibility and On track/Behind/Overdue classification as
 * growthStatus above, plus the raw figures the card displays (weights stay
 * in canonical kg; the page converts to the farm's display unit). */
export type TimeToMarket = {
  label: "On track" | "Behind" | "Overdue";
  cls: "good" | "warn" | "critical";
  currentWeightKg: number;
  targetWeightKg: number;
  weightPct: number;
  expectedWeightKg: number;
  targetMonths: number;
  ageRefIsDob: boolean;
  timeProgressPct: number;
  daysDiff: number;
} | null;

export function timeToMarket(pig: PigForGrowth): TimeToMarket {
  const g = growthStatus(pig);
  if (!g) return null;
  const ageMonths = ageMonthsOf(pig);
  const ref = pig.dob ?? pig.acquiredDate;
  if (ageMonths === null || !ref || !pig.targetWeightKg || !pig.targetMonths) return null;

  const expectedWeightKg = Math.min(pig.targetWeightKg, pig.targetWeightKg * (ageMonths / pig.targetMonths));
  const weightPct = Math.round((pig.currentWeightKg / pig.targetWeightKg) * 100);
  const timeProgressPct = Math.round(Math.min(ageMonths / pig.targetMonths, 1) * 100);
  const targetDate = new Date(ref.getTime() + pig.targetMonths * MS_PER_MONTH);
  const daysDiff = Math.round((Date.now() - targetDate.getTime()) / 86400000);

  return {
    label: g.label,
    cls: g.cls,
    currentWeightKg: pig.currentWeightKg,
    targetWeightKg: pig.targetWeightKg,
    weightPct,
    expectedWeightKg,
    targetMonths: pig.targetMonths,
    ageRefIsDob: pig.dob != null,
    timeProgressPct,
    daysDiff,
  };
}
