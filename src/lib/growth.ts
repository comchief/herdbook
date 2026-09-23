/** Growth-progress tracking for non-breeding pigs (piglet/weaner/grower/
 * finisher), driven by the platform's growth-stage rules (age/weight bands
 * per stage — see src/lib/growth-rules.ts, editable at
 * /admin/growth-rules). Breeding stock, and any pig with no age or
 * acquisition reference, has no growth status (the UI shows a dash for
 * those).
 *
 * Two tracking modes, depending on what's known:
 *
 * - dob known: a pig's *stage* is derived purely from its age, and its
 *   expected weight at that age is a straight-line interpolation across
 *   its stage's weight band. Comparing actual current weight against that
 *   expectation classifies the pig as on track, behind schedule, or
 *   overdue (a pig can be behind its expected weight, or still short of
 *   market weight after its stage's age window has passed).
 *
 * - dob unknown, acquiredDate only: "days since acquired" measures time
 *   on the farm, not true age (a purchased pig could have been any age
 *   when it arrived), so age-based bands can't be trusted. Instead, the
 *   *stage* is derived from the pig's current weight, and growth is judged
 *   by comparing its actual weight gain per day since acquisition — from
 *   the acquisition weight, required when the pig was added, to its
 *   current weight — against the expected gain rate for that stage. There
 *   is no "overdue" here: with no real age to compare against a market
 *   age, a pig is either On track or Behind on its growth rate, and
 *   reaching market weight is always On track regardless of how long it
 *   took. */

import {
  ageDaysOf,
  expectedAdgKgPerDay,
  expectedWeightRangeKg,
  stageForAgeDays,
  stageForWeightKg,
  STAGE_LABEL,
  type GrowthStageKey,
  type GrowthStageRules,
  type StageRule,
} from "./growth-rules";

type WeightLogEntry = { date: string; weightKg: number };

export type PigForGrowth = {
  status: string;
  dob: Date | null;
  acquiredDate: Date | null;
  currentWeightKg: number;
  /** jsonb weight-log column, oldest entry first — its first entry is the
   * pig's baseline weight (dated at acquiredDate when the pig was added as
   * acquired-only stock; see appendWeightLog in actions/pigs.ts). */
  weightLog: unknown;
};

function parseWeightLog(raw: unknown): WeightLogEntry[] {
  return Array.isArray(raw) ? (raw as WeightLogEntry[]) : [];
}

/** The weight recorded for this pig at (or nearest to) acquisition — the
 * oldest entry in its weight log, which is always present since a weight
 * is required to add any pig. Returns null only if the log is somehow
 * empty (pre-existing data from before weight logging existed). */
function acquisitionBaselineKg(pig: PigForGrowth): number | null {
  const log = parseWeightLog(pig.weightLog);
  return log.length > 0 ? log[0].weightKg : null;
}

export type GrowthStatus = {
  label: "On track" | "Behind" | "Overdue";
  pct: number;
  cls: "good" | "warn" | "critical";
  /** The stage this pig's age (or, with no dob, its weight) actually puts
   * it in — may differ from its recorded `status` (see stageMismatch). */
  autoStage: GrowthStageKey;
  /** True when the pig's recorded status no longer matches its
   * age- or weight-derived stage — e.g. it's grown into Grower but is
   * still marked Weaner. Surfaced as a "needs attention" alert. */
  stageMismatch: boolean;
} | null;

const GROWTH_ELIGIBLE = new Set<string>(["piglet", "weaner", "grower", "finisher"]);

/** Shared computation behind growthStatus() and timeToMarket() so the two
 * never disagree — dob-known pigs are judged by age against the age/weight
 * bands; acquired-only pigs are judged by weight-gain rate (see the
 * file-header comment). */
type GrowthDetail = {
  label: "On track" | "Behind" | "Overdue";
  pct: number;
  cls: "good" | "warn" | "critical";
  autoStage: GrowthStageKey;
  stageMismatch: boolean;
  stageRule: StageRule;
  ageDays: number;
  ageRefIsDob: boolean;
  expectedMinWeightKg: number;
  expectedMaxWeightKg: number;
  /** Only set for acquired-only (weight-tracked) pigs with enough data to
   * judge a rate; null for dob-known pigs and for freshly-acquired ones. */
  actualAdgKgPerDay: number | null;
  expectedAdgKgPerDay: number | null;
};

function computeGrowth(pig: PigForGrowth, rules: GrowthStageRules): GrowthDetail | null {
  if (!GROWTH_ELIGIBLE.has(pig.status)) return null;
  const ageDays = ageDaysOf(pig);
  if (ageDays === null) return null;
  const ageRefIsDob = pig.dob != null;

  if (ageRefIsDob) {
    const stageRule = stageForAgeDays(ageDays, rules);
    const autoStage = stageRule.stage;
    const stageMismatch = pig.status !== autoStage;
    const pastMarketAge = ageDays > rules.finisher.ageMaxDays;

    if (pastMarketAge) {
      const marketMinKg = rules.finisher.endWeightMinKg;
      const base = {
        autoStage,
        stageMismatch,
        stageRule,
        ageDays,
        ageRefIsDob,
        expectedMinWeightKg: marketMinKg,
        expectedMaxWeightKg: rules.finisher.endWeightMaxKg,
        actualAdgKgPerDay: null,
        expectedAdgKgPerDay: null,
      };
      if (pig.currentWeightKg >= marketMinKg) {
        return { ...base, label: "On track", pct: 100, cls: "good" };
      }
      const pct = Math.max(1, Math.round((1 - pig.currentWeightKg / marketMinKg) * 100));
      return { ...base, label: "Overdue", pct, cls: "critical" };
    }

    const { minKg, maxKg } = expectedWeightRangeKg(ageDays, stageRule);
    if (minKg <= 0) return null;
    const ratio = pig.currentWeightKg / minKg;
    const base = {
      autoStage,
      stageMismatch,
      stageRule,
      ageDays,
      ageRefIsDob,
      expectedMinWeightKg: minKg,
      expectedMaxWeightKg: maxKg,
      actualAdgKgPerDay: null,
      expectedAdgKgPerDay: null,
    };
    if (ratio >= 1) {
      return { ...base, label: "On track", pct: Math.round(Math.min(ratio, 1.5) * 100), cls: "good" };
    }
    const pct = Math.max(1, Math.round((1 - ratio) * 100));
    return { ...base, label: "Behind", pct, cls: "warn" };
  }

  // Acquired-only (no dob): stage comes from current weight, not from the
  // unreliable "days since acquired" age, and growth is judged by weight
  // gained per day since the acquisition weight rather than by an age
  // band. There is no "Overdue" here — no real age means no way to say a
  // pig has run out of time, so reaching market weight is always On track.
  const stageRule = stageForWeightKg(pig.currentWeightKg, rules);
  const autoStage = stageRule.stage;
  const stageMismatch = pig.status !== autoStage;
  const expectedMinWeightKg = stageRule.startWeightMinKg;
  const expectedMaxWeightKg = stageRule.endWeightMaxKg;
  const marketMinKg = rules.finisher.endWeightMinKg;
  const base = { autoStage, stageMismatch, stageRule, ageDays, ageRefIsDob, expectedMinWeightKg, expectedMaxWeightKg };

  if (pig.currentWeightKg >= marketMinKg) {
    return { ...base, label: "On track", pct: 100, cls: "good", actualAdgKgPerDay: null, expectedAdgKgPerDay: null };
  }

  const baselineKg = acquisitionBaselineKg(pig);
  const expectedAdg = expectedAdgKgPerDay(stageRule);
  // Fewer than 3 days on file, no baseline weight, or a degenerate rule
  // (0-day stage window): not enough signal to judge a rate — default to
  // On track rather than flag a pig behind on its very first day.
  if (baselineKg === null || ageDays < 3 || expectedAdg <= 0) {
    return {
      ...base,
      label: "On track",
      pct: 100,
      cls: "good",
      actualAdgKgPerDay: null,
      expectedAdgKgPerDay: expectedAdg > 0 ? expectedAdg : null,
    };
  }

  const actualAdg = (pig.currentWeightKg - baselineKg) / ageDays;
  const ratio = actualAdg / expectedAdg;
  if (ratio >= 1) {
    return {
      ...base,
      label: "On track",
      pct: Math.round(Math.min(ratio, 1.5) * 100),
      cls: "good",
      actualAdgKgPerDay: actualAdg,
      expectedAdgKgPerDay: expectedAdg,
    };
  }
  const pct = Math.max(1, Math.round((1 - ratio) * 100));
  return { ...base, label: "Behind", pct, cls: "warn", actualAdgKgPerDay: actualAdg, expectedAdgKgPerDay: expectedAdg };
}

export function growthStatus(pig: PigForGrowth, rules: GrowthStageRules): GrowthStatus {
  const d = computeGrowth(pig, rules);
  if (!d) return null;
  return { label: d.label, pct: d.pct, cls: d.cls, autoStage: d.autoStage, stageMismatch: d.stageMismatch };
}

/** Fuller breakdown for the "Time to market" card on a pig's profile page —
 * same eligibility and On track/Behind[/Overdue] classification as
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
  /** Weight-gain figures for acquired-only pigs (see file header); null
   * for dob-known pigs, which are judged by age instead. */
  actualAdgKgPerDay: number | null;
  expectedAdgKgPerDay: number | null;
} | null;

export function timeToMarket(pig: PigForGrowth, rules: GrowthStageRules): TimeToMarket {
  const d = computeGrowth(pig, rules);
  if (!d) return null;
  const marketAgeMaxDays = rules.finisher.ageMaxDays;
  const timeProgressPct = d.ageRefIsDob
    ? Math.round(Math.min(d.ageDays / marketAgeMaxDays, 1) * 100)
    : Math.round(Math.min(pig.currentWeightKg / rules.finisher.endWeightMinKg, 1) * 100);

  return {
    label: d.label,
    cls: d.cls,
    currentWeightKg: pig.currentWeightKg,
    expectedMinWeightKg: d.expectedMinWeightKg,
    expectedMaxWeightKg: d.expectedMaxWeightKg,
    marketMinWeightKg: rules.finisher.endWeightMinKg,
    marketMaxWeightKg: rules.finisher.endWeightMaxKg,
    stage: d.stageRule.stage,
    stageLabel: STAGE_LABEL[d.stageRule.stage],
    autoStage: d.autoStage,
    stageMismatch: d.stageMismatch,
    ageDays: d.ageDays,
    ageRefIsDob: d.ageRefIsDob,
    marketAgeMinDays: rules.finisher.ageMinDays,
    marketAgeMaxDays,
    timeProgressPct,
    daysDiff: d.ageDays - marketAgeMaxDays,
    actualAdgKgPerDay: d.actualAdgKgPerDay,
    expectedAdgKgPerDay: d.expectedAdgKgPerDay,
  };
}
