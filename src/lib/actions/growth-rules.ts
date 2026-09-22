"use server";

import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { saveGrowthStageRule } from "@/lib/growth-rules-db";
import { displayToKg, isWeightUnit, type WeightUnit } from "@/lib/units";
import type { GrowthStageKey } from "@/lib/growth-rules";

const STAGES: { key: GrowthStageKey; order: number }[] = [
  { key: "piglet", order: 0 },
  { key: "weaner", order: 1 },
  { key: "grower", order: 2 },
  { key: "finisher", order: 3 },
];

function num(formData: FormData, name: string): number | null {
  const raw = formData.get(name);
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Saves all four growth-stage rules at once from the admin form. Ages are
 * entered in weeks (converted to whole days for storage); weights are
 * entered in the form's chosen unit (converted to canonical kg). */
export async function updateGrowthStageRulesAction(formData: FormData) {
  const session = await readSession();
  if (!session || !session.isPlatformAdmin) redirect("/app");

  const unitRaw = String(formData.get("unit") || "lbs");
  const unit: WeightUnit = isWeightUnit(unitRaw) ? unitRaw : "lbs";

  for (const { key, order } of STAGES) {
    const ageMinWeeks = num(formData, `${key}_ageMinWeeks`);
    const ageMaxWeeks = num(formData, `${key}_ageMaxWeeks`);
    const startMin = num(formData, `${key}_startWeightMin`);
    const startMax = num(formData, `${key}_startWeightMax`);
    const endMin = num(formData, `${key}_endWeightMin`);
    const endMax = num(formData, `${key}_endWeightMax`);

    if (ageMinWeeks === null || ageMaxWeeks === null || startMin === null || startMax === null || endMin === null || endMax === null) {
      redirect("/admin/growth-rules?error=" + encodeURIComponent(`Fill in every field for the ${key} stage.`));
    }
    if (ageMaxWeeks! <= ageMinWeeks!) {
      redirect("/admin/growth-rules?error=" + encodeURIComponent(`${key}: the max age must be greater than the min age.`));
    }

    await saveGrowthStageRule({
      stage: key,
      order,
      ageMinDays: Math.round(ageMinWeeks! * 7),
      ageMaxDays: Math.round(ageMaxWeeks! * 7),
      startWeightMinKg: displayToKg(startMin!, unit),
      startWeightMaxKg: displayToKg(startMax!, unit),
      endWeightMinKg: displayToKg(endMin!, unit),
      endWeightMaxKg: displayToKg(endMax!, unit),
    });
  }

  redirect("/admin/growth-rules?saved=1");
}
