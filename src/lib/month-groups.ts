/** Splits a date-sorted log (expenses, feed movements) into the current
 * month — shown row by row — and every earlier month, each rolled up into
 * one collapsed group the user can expand. Months are UTC calendar months,
 * matching how the rest of the app stores and formats calendar dates (see
 * fmtDate in src/lib/format.ts). Anything dated this month or later stays
 * in `current`, so a future-dated entry is never hidden. Order within each
 * group is preserved from the input. */
export function monthKey(d: Date) {
  return d.toISOString().slice(0, 7);
}

export function monthLabel(key: string) {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

export type PastMonth<T> = { key: string; label: string; items: T[] };

export function splitByMonth<T>(items: T[], getDate: (item: T) => Date, now: Date = new Date()) {
  const currentKey = monthKey(now);
  const current: T[] = [];
  const byMonth = new Map<string, T[]>();
  for (const item of items) {
    const key = monthKey(getDate(item));
    if (key >= currentKey) {
      current.push(item);
    } else {
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(item);
    }
  }
  const past: PastMonth<T>[] = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, groupItems]) => ({ key, label: monthLabel(key), items: groupItems }));
  return { current, past, currentLabel: monthLabel(currentKey) };
}
