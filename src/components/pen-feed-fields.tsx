"use client";

import { useState } from "react";
import { displayValue } from "@/lib/units";

export type PenFeedPig = { id: string; name: string; feedRation: string | null; dailyFeedKg: number | null };
export type PenFeedRation = { id: string; feedType: string };
export type PenFeedUnit = "kg" | "lbs";

export type PenFeedDefaults = {
  feedType: string;
  totalWeightKg: number | null;
  durationValue: number | null;
  durationUnit: string;
};

/** The "Assign feeding" popover's body, for one pen — a mode switch between
 * the existing per-pig daily amounts and a single bulk/ad-lib allowance for
 * the whole pen (see pen_feed_plans in schema.ts and assignPenFeedAction in
 * src/lib/actions/feed.ts). Client-only because switching modes has to
 * swap the visible fields immediately, the same pattern as
 * MedicalTypeFields on the health page. The hidden `pigId` inputs are
 * rendered here (not by the caller) so they stay in the same form
 * regardless of which mode is showing — the server action needs the full
 * pen roster in bulk mode too, to clear any stale per-pig amounts. */
export function PenFeedFields({
  pigs,
  rations,
  unit,
  defaultMode,
  defaultBulk,
}: {
  pigs: PenFeedPig[];
  rations: PenFeedRation[];
  unit: PenFeedUnit;
  defaultMode: "per-pig" | "bulk";
  defaultBulk: PenFeedDefaults;
}) {
  const [mode, setMode] = useState<"per-pig" | "bulk">(defaultMode);
  const unitLabel = unit === "lbs" ? "lb" : "kg";

  return (
    <>
      <input type="hidden" name="mode" value={mode} />
      {pigs.map((p) => (
        <input key={p.id} type="hidden" name="pigId" value={p.id} />
      ))}

      <div className="field">
        <label>Feeding mode</label>
        <select value={mode} onChange={(e) => setMode(e.target.value === "bulk" ? "bulk" : "per-pig")}>
          <option value="per-pig">Per-pig amounts</option>
          <option value="bulk">Bulk (ad-lib) for this pen</option>
        </select>
      </div>

      {mode === "bulk" ? (
        <div className="space-y-2">
          <p className="text-[11px] text-muted">
            The whole pen feeds freely from one ration instead of set daily amounts per pig — for a self-feeder or unlimited access.
          </p>
          <div className="field">
            <label>Ration</label>
            <select name="bulkFeedType" defaultValue={defaultBulk.feedType} required>
              <option value="" disabled>
                — choose —
              </option>
              {rations.map((r) => (
                <option key={r.id} value={r.feedType}>
                  {r.feedType}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Total for the pen ({unitLabel})</label>
            <input
              type="number"
              step="1"
              min="0"
              name="bulkTotalWeight"
              defaultValue={defaultBulk.totalWeightKg !== null ? displayValue(defaultBulk.totalWeightKg, unit, 0) : ""}
              placeholder={unit === "lbs" ? "1100" : "500"}
              required
            />
          </div>
          <div className="flex gap-2">
            <div className="field flex-1">
              <label>Should last</label>
              <input
                type="number"
                step="0.5"
                min="0"
                name="bulkDurationValue"
                defaultValue={defaultBulk.durationValue ?? ""}
                placeholder="2"
                required
              />
            </div>
            <div className="field w-32">
              <label>&nbsp;</label>
              <select name="bulkDurationUnit" defaultValue={defaultBulk.durationUnit}>
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
                <option value="months">Months</option>
              </select>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {pigs.map((p) => (
            <div key={p.id} className="flex gap-2 items-end border-b border-border pb-2 last:border-b-0">
              <div className="field flex-1">
                <label>{p.name}</label>
                <select name="feedRation" defaultValue={p.feedRation ?? ""}>
                  <option value="">—</option>
                  {rations.map((r) => (
                    <option key={r.id} value={r.feedType}>
                      {r.feedType}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field w-24">
                <label>{unitLabel}/day</label>
                <input type="number" step="0.1" min="0" name="dailyFeedKg" defaultValue={displayValue(p.dailyFeedKg, unit)} />
              </div>
            </div>
          ))}
          {pigs.length === 0 && <p className="text-xs text-muted">No pigs in this pen.</p>}
        </div>
      )}
    </>
  );
}
