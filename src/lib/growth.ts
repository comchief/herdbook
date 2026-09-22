/** Growth-progress tracking for non-breeding pigs (piglet/weaner/grower/
 * finisher), driven by the platform's growth-stage rules (age/weight bands
 * per stage — see src/lib/growth-rules.ts, editable at
 * /admin/growth-rules). A pig's *stage* is derived purely from its age;
 * its expected weight at that age is a straight-line interpolation across
 * its stage's weight band. Comparing actual current weight against that
 * expectation classifies the pig as on track, behind schedule, or overdue.
 * Breeding stock, and any pig with no age reference, has no growth status
 * (the UI shows a dash for those).
 *
 * Age comes from dob when known; otherwise acquiredDate is used as a
 * fallback reference point (flagged as approximate by the caller, since it
 * measures time-on-farm rather than true age). */

import {
  ageDaysOf,
  expectedWeightRangeKg,
  stageForAgeDays,
  STAGE_LABEL,
  type GrowthStageKey,
  type GrowthStageRules,
} from "./growth-rules";

export type PigForGrowth = {
  status: string;
  dob: Date | null;
  acquiredDate: Date | null;
  currentWeightKg: number;
};

export type GrowthStatus = {
  label: "On track" | "Behind" | "Overdue";
  pct: number;
  cls: "good" | "warn" | "critical";
  /** The stage this pig's age actually puts it in — may differ from its
   * recorded `status` (see stageMismatch). */
  autoStage: GrowthStageKey;
  /** True when the pig's recorded status no longer matches its
   * age-derived stage — e.g. it's aged into Grower but is still marked
   * Weaner. Surfaced as a "needs attention" alert. */
  stageMismatch: boolean;
} | null;

const GROWTH_ELIGIBLE = new Set<string>(["piglet", "weaner", "grower", "finisher"]);

export function growthStatus(pig: PigForGrowth, rules: GrowthStageRules): GrowthStatus {
  if (!GROWTH_ELIGIBLE.has(pig.status)) return null;
  const ageDays = ageDaysOf(pig);
  if (ageDays === null) return null;

  const stageRule = stageForAgeDays(ageDays, rules);
  const autoStage = stageRule.stage;
  const stageMismatch = pig.status !== autoStage;
  const pastMarketAge = ageDays > rules.finisher.ageMaxDays;

  if (pastMarketAge) {
    const marketMinKg = rules.finisher.endWeightMinKg;
    if (pig.currentWeightKg >= marketMinKg) {
      return { label: "On track", pct: 100, cls: "good", autoStage, stageMismatch };
    }
    const pct = Math.max(1, Math.round((1 - pig.currentWeightKg / marketMinKg) * 100));
    return { label: "Overdue", pct, cls: "critical", autoStage, stageMismatch };
  }

  const { minKg } = expectedWeightRangeKg(ageDays, stageRule);
  if (minKg <= 0) return null;
  const ratio = pig.currentWeightKg / minKg;

  if (ratio >= 1) {
    return { label: "On track", pct: Math.round(Math.min(ratio, 1.5) * 100), cls: "good", autoStage, stageMismatch };
  }
  const pct = Math.max(1, Math.round((1 - ratio) * 100));
  return { label: "Behind", pct, cls: "warn", autoStage, stageMismatch };
}

/** Fuller breakdown for the "Time to market" card on a pig's profile page —
 * same eligibility and On track/Behind/Overdue classification as
 * growthStatus above, plus the raw figures the card displays (weights stay
 * in canonical kg; the page converts to the farm's display unit). */
export type TimeToMarket = {
  label: "On track" | "Behind" | "Overdue";
  cls: "good" | "warn" | "critical";
  currentWeightKg: number;
  expectedMinWeightKg: number;
  expectedMaxWeightKg: number;
  marketMinWeightKg: number;
  marketMaxWeightKg: number;
  stage: GrowthStageKey;
  stageLabel: string;
  autoStage: GrowthStageKey;
  stageMismatch: boolean;
  ageDays: number;
  ageRefIsDob: boolean;
  marketAgeMinDays: number;
  marketAgeMaxDays: number;
  timeProgressPct: number;
  daysDiff: number;
} | null;

export function timeToMarket(pig: PigForGrowth, rules: GrowthStageRules): TimeToMarket {
  const g = growthStatus(pig, rules);
  if (!g) return null;
  const ageDays = ageDaysOf(pig);
  if (ageDays === null) return null;

  const stageRule = stageForAgeDays(ageDays, rules);
  const { minKg, maxKg } = expectedWeightRangeKg(ageDays, stageRule);
  const marketAgeMaxDays = rules.finisher.ageMaxDays;
  const timeProgressPct = Math.round(Math.min(ageDays / marketAgeMaxDays, 1) * 100);

  return {
    label: g.label,
    cls: g.cls,
    currentWeightKg: pig.currentWeightKg,
    expectedMinWeightKg: minKg,
    expectedMaxWeightKg: maxKg,
    marketMinWeightKg: rules.finisher.endWeightMinKg,
    marketMaxWeightKg: rules.finisher.endWeightMaxKg,
    stage: stageRule.stage,
    stageLabel: STAGE_LABEL[stageRule.stage],
    autoStage: g.autoStage,
    stageMismatch: g.stageMismatch,
    ageDays,
    ageRefIsDob: pig.dob != null,
    marketAgeMinDays: rules.finisher.ageMinDays,
    marketAgeMaxDays,
    timeProgressPct,
    daysDiff: ageDays - marketAgeMaxDays,
  };
}
