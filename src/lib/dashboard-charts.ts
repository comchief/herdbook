import type { LinePoint } from "@/components/charts";

type PigForTrend = { weightLog: unknown; createdAt: Date };

/** Total herd biomass by month, carrying each pig's last known weigh-in
 * forward across months it wasn't re-weighed. Only pigs with at least one
 * weigh-in recorded contribute — the chart reports "not enough data" until
 * a few exist (see LineChart's emptyMessage). */
export function herdWeightTrend(pigs: PigForTrend[], monthsBack = 6): LinePoint[] {
  const now = new Date();
  const months: { key: string; label: string; end: Date }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: "short" }), end });
  }

  type Entry = { date: Date; weightKg: number };
  const perPigEntries: Entry[][] = pigs.map((p) => {
    const log = Array.isArray(p.weightLog) ? (p.weightLog as { date: string; weightKg: number }[]) : [];
    return log
      .map((e) => ({ date: new Date(e.date), weightKg: e.weightKg }))
      .filter((e) => !Number.isNaN(e.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  });

  const anyData = perPigEntries.some((e) => e.length > 0);
  if (!anyData) return [];

  return months.map((m) => {
    let total = 0;
    for (const entries of perPigEntries) {
      let latest: number | null = null;
      for (const e of entries) {
        if (e.date.getTime() <= m.end.getTime()) latest = e.weightKg;
        else break;
      }
      if (latest !== null) total += latest;
    }
    return { label: m.label, value: Math.round(total) };
  });
}

const STATUS_ORDER = ["piglet", "weaner", "grower", "finisher", "breeding-sow", "breeding-boar"];
const STATUS_LABEL: Record<string, string> = {
  piglet: "Piglet",
  weaner: "Weaner",
  grower: "Grower",
  finisher: "Finisher",
  "breeding-sow": "Breeding sow",
  "breeding-boar": "Breeding boar",
};

/** Pig count by lifecycle status, in a fixed category order so the same
 * status always gets the same color across renders. */
export function herdComposition(pigs: { status: string }[]) {
  const counts = new Map<string, number>();
  for (const p of pigs) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
  const known = STATUS_ORDER.filter((s) => counts.has(s)).map((s) => ({ label: STATUS_LABEL[s], value: counts.get(s)! }));
  const other = [...counts.entries()].filter(([s]) => !STATUS_ORDER.includes(s));
  for (const [s, v] of other) known.push({ label: s, value: v });
  return known;
}
