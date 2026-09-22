/** Platform-wide growth-stage rules: the age/weight bands that govern how
 * a pig automatically moves through Piglet → Weaner → Grower → Finisher,
 * editable by the Herdbook operator at /admin/growth-rules (schema:
 * growthStageRules in src/db/schema.ts).
 *
 * A pig's *stage* is derived purely from its age — never chosen by hand —
 * and its expected weight at that age is a straight-line interpolation
 * between the stage's start and end weight bands. src/lib/growth.ts uses
 * this to classify each pig On track / Behind / Overdue, and to flag when
 * a pig's manually-recorded status (set when it was added, or on its edit
 * form) no longer matches the stage its age now puts it in.
 *
 * This file is pure (types, defaults, and plain math) so it's safe to
 * import from client components like pigs-table.tsx. The DB-backed reader
 * (getGrowthStageRules) and writer (saveGrowthStageRule) live in
 * growth-rules-db.ts instead, which pulls in the `pg` driver — importing
 * that from a client component would break the browser bundle. */

export type GrowthStageKey = "piglet" | "weaner" | "grower" | "finisher";

export const STAGE_ORDER: GrowthStageKey[] = ["piglet", "weaner", "grower", "finisher"];

export const STAGE_LABEL: Record<GrowthStageKey, string> = {
  piglet: "Piglet",
  weaner: "Weaner",
  grower: "Grower",
  finisher: "Finisher",
};

export type StageRule = {
  stage: GrowthStageKey;
  order: number;
  ageMinDays: number;
  ageMaxDays: number;
  startWeightMinKg: number;
  startWeightMaxKg: number;
  endWeightMinKg: number;
  endWeightMaxKg: number;
};

export type GrowthStageRules = Record<GrowthStageKey, StageRule>;

const KG_PER_LB = 0.45359237;
const lb = (v: number) => v * KG_PER_LB;

/** Default rules, matching the operator's spec: pigs reach market weight
 * in about 25–28 weeks. Each stage's start band is set equal to the
 * previous stage's end band so the expected-weight curve is continuous
 * across the whole lifecycle, exactly as described (piglets ending around
 * 13–15 lb is where weaners pick up, and so on). */
export const DEFAULT_STAGE_RULES: GrowthStageRules = {
  piglet: {
    stage: "piglet",
    order: 0,
    ageMinDays: 0,
    ageMaxDays: 21, // birth to 3 weeks
    startWeightMinKg: lb(2),
    startWeightMaxKg: lb(3),
    endWeightMinKg: lb(13),
    endWeightMaxKg: lb(15),
  },
  weaner: {
    stage: "weaner",
    order: 1,
    ageMinDays: 21,
    ageMaxDays: 56, // 3 to 8 weeks
    startWeightMinKg: lb(13),
    startWeightMaxKg: lb(15),
    endWeightMinKg: lb(40),
    endWeightMaxKg: lb(50),
  },
  grower: {
    stage: "grower",
    order: 2,
    ageMinDays: 56,
    ageMaxDays: 140, // 8 to 20 weeks
    startWeightMinKg: lb(40),
    startWeightMaxKg: lb(50),
    endWeightMinKg: lb(150),
    endWeightMaxKg: lb(200),
  },
  finisher: {
    stage: "finisher",
    order: 3,
    ageMinDays: 140,
    ageMaxDays: 196, // 20 to 26-28 weeks (5-7 months)
    startWeightMinKg: lb(150),
    startWeightMaxKg: lb(200),
    endWeightMinKg: lb(250), // market weight: 250-280 lb
    endWeightMaxKg: lb(280),
  },
};

const MS_PER_DAY = 86400000;

/** Age in whole days from dob (preferred) or acquiredDate (fallback,
 * approximate — measures time-on-farm rather than true age). */
export function ageDaysOf(pig: { dob: Date | null; acquiredDate: Date | null }): number | null {
  const ref = pig.dob ?? pig.acquiredDate;
  if (!ref) return null;
  return Math.floor((Date.now() - ref.getTime()) / MS_PER_DAY);
}

/** The stage a pig's age puts it in. Ages past the Finisher window still
 * resolve to "finisher" (there's nowhere further to go) — callers compare
 * against rules.finisher.ageMaxDays separately to flag overdue pigs. */
export function stageForAgeDays(ageDays: number, rules: GrowthStageRules): StageRule {
  const ordered = STAGE_ORDER.map((k) => rules[k]);
  for (const rule of ordered) {
    if (ageDays < rule.ageMaxDays) return rule;
  }
  return rules.finisher;
}

/** Expected weight range (kg) for a given age within a stage: a
 * straight-line interpolation between the stage's start and end bands. */
export function expectedWeightRangeKg(ageDays: number, rule: StageRule): { minKg: number; maxKg: number } {
  const span = rule.ageMaxDays - rule.ageMinDays;
  const progress = span > 0 ? Math.min(Math.max((ageDays - rule.ageMinDays) / span, 0), 1) : 1;
  return {
    minKg: rule.startWeightMinKg + (rule.endWeightMinKg - rule.startWeightMinKg) * progress,
    maxKg: rule.startWeightMaxKg + (rule.endWeightMaxKg - rule.startWeightMaxKg) * progress,
  };
}
