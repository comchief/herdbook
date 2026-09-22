/** Maps the underlying biological sex (`sexBase`, "Male" | "Female" — used
 * for breeding-pair logic and stored as-is) plus the pig's current status to
 * the conventional swine-industry term shown throughout the UI. Breeding
 * status implies intact/proven stock; everything else is assumed to be
 * raised for market — a male pig outside the breeding pen is shown as a
 * barrow (castrated), which is the overwhelming norm for meat production. */

export type PigForClassification = {
  sexBase: string;
  status: string;
};

export function classifySex(pig: PigForClassification): string {
  if (pig.sexBase === "Male") {
    return pig.status === "breeding-boar" ? "Boar" : "Barrow";
  }
  if (pig.sexBase === "Female") {
    return pig.status === "breeding-sow" ? "Sow" : "Gilt";
  }
  return pig.sexBase;
}
