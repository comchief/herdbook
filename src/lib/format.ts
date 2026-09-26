/** Shared display formatters for calendar-date values (dob, acquiredDate,
 * matingDate, and the like) that come from an <input type="date"> and are
 * stored as a UTC-midnight timestamp.
 *
 * Formatting those with the server's local timezone is wrong: a server
 * running anywhere behind UTC (e.g. America/Jamaica, UTC-5) rolls a UTC
 * midnight back to the previous evening, so "2026-01-15" would render as
 * "Jan 14, 2026". These values represent a calendar day with no time
 * component, so they're always formatted in UTC to keep the displayed date
 * the one that was actually entered, regardless of where the app runs. */
export function fmtDate(d: Date | null | undefined, fallback = "—") {
  if (!d) return fallback;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Same idea for shorter labels (e.g. chart axis ticks: "Jan 15"). */
export function fmtDateShort(d: Date | null | undefined, fallback = "—") {
  if (!d) return fallback;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Formats an actual moment in time (e.g. an activity-log entry's
 * createdAt) — unlike fmtDate above, which intentionally pins
 * calendar-only dates to UTC, this is a real instant, so a timezone
 * genuinely applies. Pass the farm's own timezone (same one localHour in
 * weather.ts reads) to show it in local farm time; omitted, it falls back
 * to the rendering environment's default. */
export function fmtDateTime(d: Date | null | undefined, timezone?: string | null, fallback = "—") {
  if (!d) return fallback;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  if (timezone) opts.timeZone = timezone;
  return d.toLocaleString(undefined, opts);
}
