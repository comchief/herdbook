import { STAGE_LABEL, STAGE_ORDER } from "@/lib/growth-rules";
import { getGrowthStageRules } from "@/lib/growth-rules-db";
import { updateGrowthStageRulesAction } from "@/lib/actions/growth-rules";
import { displayValue } from "@/lib/units";
import { Icon } from "@/components/icons";

const STAGE_HINT: Record<string, string> = {
  piglet: "Birth to weaning.",
  weaner: "Weaning to the start of grow-out.",
  grower: "Steady growth toward finishing weight.",
  finisher: "Final stretch to market weight.",
};

function weeksValue(days: number): string {
  return (days / 7).toFixed(days % 7 === 0 ? 0 : 1);
}

export default async function AdminGrowthRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const rules = await getGrowthStageRules();
  const unit = "lbs" as const;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-ink mb-1 flex items-center gap-2">
        <Icon name="trend" className="w-5 h-5 text-accent" />
        Growth stage rules
      </h1>
      <p className="text-ink-soft text-sm mb-6">
        These age and weight bands govern every farm&apos;s herd: each pig&apos;s Piglet/Weaner/Grower/Finisher stage is
        tracked automatically from its age, and its weight is checked against the band for that stage to flag pigs
        that are on track, falling behind, or overdue. Farms see this on their dashboard&apos;s &quot;Needs attention&quot;
        card and on each pig&apos;s profile.
      </p>

      {saved && <div className="mb-4 text-sm text-good bg-accent-soft rounded-lg px-3 py-2">Saved — every farm&apos;s growth tracking now uses these rules.</div>}
      {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}

      <form action={updateGrowthStageRulesAction} className="space-y-4">
        <input type="hidden" name="unit" value={unit} />

        {STAGE_ORDER.map((key) => {
          const r = rules[key];
          return (
            <div key={key} className="card p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-ink">{STAGE_LABEL[key]}</h2>
                <span className="badge badge-muted">stage {r.order + 1} of 4</span>
              </div>
              <p className="text-xs text-muted mb-4">{STAGE_HINT[key]}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="field">
                  <label>Age from (weeks)</label>
                  <input type="number" step="0.1" min="0" name={`${key}_ageMinWeeks`} defaultValue={weeksValue(r.ageMinDays)} required />
                </div>
                <div className="field">
                  <label>Age to (weeks)</label>
                  <input type="number" step="0.1" min="0" name={`${key}_ageMaxWeeks`} defaultValue={weeksValue(r.ageMaxDays)} required />
                </div>
              </div>

              <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Weight at the start of this stage (lb)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="field">
                  <label>Minimum</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    name={`${key}_startWeightMin`}
                    defaultValue={displayValue(r.startWeightMinKg, unit)}
                    required
                  />
                </div>
                <div className="field">
                  <label>Maximum</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    name={`${key}_startWeightMax`}
                    defaultValue={displayValue(r.startWeightMaxKg, unit)}
                    required
                  />
                </div>
              </div>

              <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                Weight at the end of this stage (lb){key === "finisher" && " — market weight"}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="field">
                  <label>Minimum</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    name={`${key}_endWeightMin`}
                    defaultValue={displayValue(r.endWeightMinKg, unit)}
                    required
                  />
                </div>
                <div className="field">
                  <label>Maximum</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    name={`${key}_endWeightMax`}
                    defaultValue={displayValue(r.endWeightMaxKg, unit)}
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-muted mt-3">
                ≈ {r.startWeightMinKg.toFixed(1)}–{r.startWeightMaxKg.toFixed(1)} kg starting, {r.endWeightMinKg.toFixed(1)}–
                {r.endWeightMaxKg.toFixed(1)} kg by the end.
              </p>
            </div>
          );
        })}

        <button type="submit" className="btn btn-primary">
          Save rules
        </button>
      </form>
    </div>
  );
}
