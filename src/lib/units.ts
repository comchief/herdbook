/** Weight-unit conversion for the farm's chosen unit of measure
 * (Farm Settings → "kg" | "lbs"). Every weight is stored in the database
 * canonically in kilograms (the *Kg-suffixed columns) regardless of the
 * farm's setting — only display and form input/output convert. That keeps
 * aggregation, growth-tracking math, and historical weigh-in logs
 * unambiguous even if a farm switches units later. */

export type WeightUnit = "kg" | "lbs";
const KG_PER_LB = 0.45359237;

export function isWeightUnit(v: unknown): v is WeightUnit {
  return v === "kg" || v === "lbs";
}

export function weightUnitLabel(unit: WeightUnit): string {
  return unit === "lbs" ? "lb" : "kg";
}

/** Canonical kg (as stored) -> the farm's display unit. */
export function kgToDisplay(kg: number, unit: WeightUnit): number {
  return unit === "lbs" ? kg / KG_PER_LB : kg;
}

/** A value entered in the farm's display unit -> canonical kg (for storage). */
export function displayToKg(value: number, unit: WeightUnit): number {
  return unit === "lbs" ? value * KG_PER_LB : value;
}

/** Canonical $/kg (as stored) -> $/display-unit, e.g. $/kg -> $/lb. */
export function kgCostToDisplay(costPerKg: number, unit: WeightUnit): number {
  return unit === "lbs" ? costPerKg * KG_PER_LB : costPerKg;
}

/** A cost entered per display-unit -> canonical $/kg (for storage). */
export function displayCostToKg(costPerUnit: number, unit: WeightUnit): number {
  return unit === "lbs" ? costPerUnit / KG_PER_LB : costPerUnit;
}

/** Formats a canonical kg value in the farm's unit, e.g. "24.5 kg" / "54.0 lb". */
export function fmtWeight(kg: number | null | undefined, unit: WeightUnit, decimals = 1): string {
  if (kg === null || kg === undefined) return "—";
  return `${kgToDisplay(kg, unit).toFixed(decimals)} ${weightUnitLabel(unit)}`;
}

/** Rounds a display-unit value to a sane number of decimals for a
 * defaultValue on a number input (avoids float noise like 110.00000001). */
export function displayValue(kg: number | null | undefined, unit: WeightUnit, decimals = 1): string {
  if (kg === null || kg === undefined) return "";
  return kgToDisplay(kg, unit).toFixed(decimals);
}

/** Formats a weight *change* (this weigh-in minus the previous one) in the
 * farm's unit, always signed — e.g. "+2.3 kg", "-1.1 lb", "0.0 kg". Used on
 * the pig profile's weight log (see src/app/app/pigs/[tag]/page.tsx), where
 * the sign is the point: it's what tells a gain from a loss at a glance. */
export function fmtWeightDelta(deltaKg: number, unit: WeightUnit, decimals = 1): string {
  const d = kgToDisplay(deltaKg, unit);
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(decimals)} ${weightUnitLabel(unit)}`;
}
