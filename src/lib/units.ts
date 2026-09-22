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
