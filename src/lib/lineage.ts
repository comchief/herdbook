/** Checks a proposed sow x boar mating for a shared immediate ancestor —
 * parent/offspring or a shared sire/dam (full or half siblings) — using the
 * plain sireTag/damTag fields already on every pig. This is a one-generation
 * check (it doesn't walk a full pedigree looking for cousins or
 * great-grandparents in common); on a small farm with limited breeding
 * stock that's the relationship most likely to actually occur and the one
 * most worth flagging.
 *
 * Returns a human-readable reason when a match is found, or null when the
 * pair looks unrelated. Called by createBreedingAction as a soft warning —
 * the mating is still saved either way (see src/lib/actions/breeding.ts). */

export type LineagePig = {
  tag: string;
  name: string;
  sireTag: string | null;
  damTag: string | null;
};

export function lineageWarning(sow: LineagePig, boar: LineagePig): string | null {
  if (sow.tag === boar.tag) return null;

  if (sow.sireTag && sow.sireTag === boar.tag) return `${boar.name} (${boar.tag}) is ${sow.name}'s sire.`;
  if (sow.damTag && sow.damTag === boar.tag) return `${boar.name} (${boar.tag}) is ${sow.name}'s dam.`;
  if (boar.sireTag && boar.sireTag === sow.tag) return `${sow.name} (${sow.tag}) is ${boar.name}'s sire.`;
  if (boar.damTag && boar.damTag === sow.tag) return `${sow.name} (${sow.tag}) is ${boar.name}'s dam.`;

  if (sow.sireTag && boar.sireTag && sow.sireTag === boar.sireTag) {
    return `${sow.name} and ${boar.name} share the same sire (${sow.sireTag}) — they're siblings or half-siblings.`;
  }
  if (sow.damTag && boar.damTag && sow.damTag === boar.damTag) {
    return `${sow.name} and ${boar.name} share the same dam (${sow.damTag}) — they're siblings or half-siblings.`;
  }

  return null;
}
