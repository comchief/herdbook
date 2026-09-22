/** DB-backed read/write for the platform's growth-stage rules — kept
 * separate from growth-rules.ts (which is pure and client-safe) because
 * this pulls in the `pg` driver via @/db. Server-only: only import this
 * from server components, server actions, or route handlers. */

import { db, schema } from "@/db";
import { DEFAULT_STAGE_RULES, type GrowthStageRules, type StageRule } from "./growth-rules";

/** Reads the operator-edited rules from the DB, falling back to
 * DEFAULT_STAGE_RULES for any stage that hasn't been saved yet — so
 * growth tracking works before the admin page has ever been touched. */
export async function getGrowthStageRules(): Promise<GrowthStageRules> {
  const rows = await db.select().from(schema.growthStageRules);
  const rules: GrowthStageRules = { ...DEFAULT_STAGE_RULES };
  for (const r of rows) {
    if (r.stage === "piglet" || r.stage === "weaner" || r.stage === "grower" || r.stage === "finisher") {
      rules[r.stage] = {
        stage: r.stage,
        order: r.order,
        ageMinDays: r.ageMinDays,
        ageMaxDays: r.ageMaxDays,
        startWeightMinKg: r.startWeightMinKg,
        startWeightMaxKg: r.startWeightMaxKg,
        endWeightMinKg: r.endWeightMinKg,
        endWeightMaxKg: r.endWeightMaxKg,
      };
    }
  }
  return rules;
}

export async function saveGrowthStageRule(rule: StageRule): Promise<void> {
  await db
    .insert(schema.growthStageRules)
    .values({ ...rule, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.growthStageRules.stage,
      set: {
        order: rule.order,
        ageMinDays: rule.ageMinDays,
        ageMaxDays: rule.ageMaxDays,
        startWeightMinKg: rule.startWeightMinKg,
        startWeightMaxKg: rule.startWeightMaxKg,
        endWeightMinKg: rule.endWeightMinKg,
        endWeightMaxKg: rule.endWeightMaxKg,
        updatedAt: new Date(),
      },
    });
}
