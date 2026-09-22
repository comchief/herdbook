/**
 * Lightweight inline-SVG charts — server-rendered, no client JS or charting
 * library. Color follows the dataviz skill's method: categorical hues are
 * assigned in the validated fixed order below (never cycled), status colors
 * (good/warn/critical) are reserved for state and never reused as series
 * identity, and every multi-series chart carries a legend so identity never
 * rides on color alone. A native `title` attribute on each point gives a
 * lightweight hover tooltip without any client-side JS (an SVG `<title>`
 * child element does the same visually, but React's SSR hoists/dedupes
 * `<title>` tags as document-metadata resources, which emptied these out
 * on the server and caused a hydration mismatch — the attribute form
 * avoids that entirely).
 */

// Validated categorical order (light-mode hexes) — see dataviz skill's
// references/palette.md. Assigned in fixed order, never cycled.
const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

export function categoricalColor(i: number) {
  return CATEGORICAL[i % CATEGORICAL.length];
}

function fmtCompact(n: number) {
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

/** Shrinks the donut's centered total as its text gets longer, so a big
 * currency figure ("J$1.2M") or a long count still fits inside the ring
 * instead of overflowing it. Five characters or fewer render at the normal
 * size; each character past that scales the font down, bottoming out at a
 * floor that keeps it legible next to the sub-label beneath it. */
function donutCenterFontSize(size: number, label: string) {
  const base = size * 0.135;
  const floor = size * 0.075;
  const baselineChars = 5;
  if (label.length <= baselineChars) return base;
  const scaled = base * (baselineChars / label.length);
  return Math.max(scaled, floor);
}

export type DonutSlice = { label: string; value: number; color?: string };

/** Part-to-whole donut with a centered total and a legend (legend is always
 * present here since these charts have 2+ series). Segments get a 2px
 * surface-color gap between them (the "surface gap" spacer) so touching
 * slices read as distinct without an outline. */
export function Donut({
  slices,
  centerLabel,
  centerSub,
  size = 132,
  thickness = 20,
  valueFormat,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  centerSub: string;
  size?: number;
  thickness?: number;
  valueFormat?: (n: number) => string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const gap = total > 0 ? 2 : 0; // px, surface-color gap between segments
  let offset = 0;

  const fmt = valueFormat ?? ((n: number) => fmtCompact(n));

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel} ${centerSub}`}>
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
          ) : (
            slices
              .filter((s) => s.value > 0)
              .map((s, i) => {
                const frac = s.value / total;
                const len = Math.max(frac * circumference - gap, 0);
                const dasharray = `${len} ${circumference - len}`;
                const dashoffset = -offset;
                offset += frac * circumference;
                const color = s.color ?? categoricalColor(i);
                // React's SVGProps typing has no `title` attribute (only the
                // element form), but the DOM/browsers support it fine — see
                // the file-header comment for why we use the attribute here.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const titleAttr: any = {
                  title: `${s.label}: ${fmt(s.value)} (${total > 0 ? Math.round((s.value / total) * 100) : 0}%)`,
                };
                return (
                  <circle
                    key={s.label}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={thickness}
                    strokeDasharray={dasharray}
                    strokeDashoffset={dashoffset}
                    strokeLinecap={slices.filter((x) => x.value > 0).length === 1 ? "butt" : "round"}
                    {...titleAttr}
                  />
                );
              })
          )}
        </g>
        <text
          x={cx}
          y={cy - 3}
          textAnchor="middle"
          className="donut-center-v"
          style={{ fontSize: donutCenterFontSize(size, centerLabel) }}
          fill="var(--ink)"
        >
          {centerLabel}
        </text>
        <text x={cx} y={cy + 15} textAnchor="middle" className="donut-center-l" style={{ fontSize: size * 0.075 }}>
          {centerSub}
        </text>
      </svg>
      <div className="donut-legend">
        {slices.map((s, i) => (
          <div className="legend-row" key={s.label}>
            <span className="sw" style={{ background: s.color ?? categoricalColor(i) }} />
            <span className="lbl">{s.label}</span>
            <span className="val">{fmt(s.value)}</span>
          </div>
        ))}
        {slices.length === 0 && <div className="legend-row"><span className="lbl">No data yet</span></div>}
      </div>
    </div>
  );
}

export type LinePoint = { label: string; value: number };

/** Single-series trend line with an area wash beneath it (a single series
 * needs no legend — the card title already says what's plotted). The last
 * point is end-labeled since that's the value the reader wants first. */
export function LineChart({
  points,
  height = 150,
  color = "#2a78d6",
  valueFormat,
  emptyMessage = "Not enough data yet — record a few pig weigh-ins to see the trend.",
}: {
  points: LinePoint[];
  height?: number;
  color?: string;
  valueFormat?: (n: number) => string;
  emptyMessage?: string;
}) {
  const fmt = valueFormat ?? ((n: number) => fmtCompact(n));
  if (points.length < 2) {
    return <div className="linechart-empty">{emptyMessage}</div>;
  }

  const width = 560;
  const padTop = 16;
  const padBottom = 8;
  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(0, Math.min(...values));
  const span = max - min || 1;
  const innerH = height - padTop - padBottom;
  const stepX = width / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = padTop + innerH - ((p.value - min) / span) * innerH;
    return { x, y, ...p };
  });

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${height - padBottom} L0,${height - padBottom} Z`;
  const last = coords[coords.length - 1];

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Trend over time">
        <line x1={0} y1={height - padBottom} x2={width} y2={height - padBottom} stroke="var(--border)" strokeWidth={1} />
        <path d={area} fill={color} opacity={0.1} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const titleAttr: any = { title: `${c.label}: ${fmt(c.value)}` };
          return (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={i === coords.length - 1 ? 4 : 3}
              fill={color}
              stroke="var(--surface)"
              strokeWidth={2}
              {...titleAttr}
            />
          );
        })}
        <text x={Math.min(last.x, width - 46)} y={Math.max(last.y - 10, 12)} textAnchor="end" fontSize={12} fontWeight={700} fill="var(--ink)">
          {fmt(last.value)}
        </text>
      </svg>
      <div className="linechart-foot">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}

/** A single ratio against a limit — the "meter" form. Fill carries severity
 * (good/warn/critical, the app's reserved status tokens); the unfilled
 * track is the surface-2 tone so state reads across the whole bar. */
export function Gauge({
  label,
  sub,
  fraction,
  tone,
}: {
  label: string;
  sub: string;
  fraction: number;
  tone: "good" | "warn" | "critical";
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className="feed-gauge">
      <div className="fg-head">
        <b>{label}</b>
        <span>{sub}</span>
      </div>
      <div className="fg-bar">
        <i className={tone === "good" ? "" : tone} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
