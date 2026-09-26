import { requireSession } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { LineChart, type LinePoint } from "@/components/charts";
import { growthStatus, timeToMarket } from "@/lib/growth";
import { STAGE_LABEL } from "@/lib/growth-rules";
import { getGrowthStageRules } from "@/lib/growth-rules-db";
import { syncPigStageAction } from "@/lib/actions/pigs";
import { confirmPregnancyCheckAction, markGestationMilestoneAction, logFarrowOutcomeAction } from "@/lib/actions/breeding";
import { fmtDate, fmtDateShort } from "@/lib/format";
import { kgToDisplay, weightUnitLabel, fmtWeight, fmtWeightDelta } from "@/lib/units";
import { classifySex } from "@/lib/pig-classification";
import { gestationMilestones } from "@/lib/gestation";

const STATUS_STYLE: Record<string, { cls: string; label: string }> = {
  piglet: { cls: "info", label: "Piglet" },
  weaner: { cls: "info", label: "Weaner" },
  grower: { cls: "muted", label: "Grower" },
  finisher: { cls: "warn", label: "Finisher" },
  "breeding-sow": { cls: "good", label: "Breeding sow" },
  "breeding-boar": { cls: "good", label: "Breeding boar" },
};

function ageLabel(d: Date) {
  const days = Math.round((Date.now() - d.getTime()) / 86400000);
  if (days < 21) return `${days}d`;
  if (days < 210) return `${Math.floor(days / 7)}w`;
  return `${(days / 30.44).toFixed(0)}mo`;
}


export default async function PigProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ stageSynced?: string }>;
}) {
  const session = await requireSession();
  const farm = await requireActiveFarm(session);
  const unit = farm.unit === "lbs" ? "lbs" : "kg";
  const unitLabel = weightUnitLabel(unit);
  const isManager = session.role !== "worker";
  const { tag } = await params;
  const { stageSynced } = await searchParams;
  const decodedTag = decodeURIComponent(tag);

  const [pig] = await db
    .select()
    .from(schema.pigs)
    .where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.tag, decodedTag)))
    .limit(1);
  if (!pig) notFound();

  const [medical, breeding, growthRules] = await Promise.all([
    db.select().from(schema.medicalRecords).where(and(eq(schema.medicalRecords.farmId, session.farmId), eq(schema.medicalRecords.pigTag, pig!.tag))),
    db
      .select()
      .from(schema.breedingRecords)
      .where(and(eq(schema.breedingRecords.farmId, session.farmId))),
    getGrowthStageRules(),
  ]);
  const relatedBreeding = breeding
    .filter((b) => b.sowTag === pig!.tag || b.boarTag === pig!.tag)
    .sort((a, b) => b.matingDate.getTime() - a.matingDate.getTime());
  // The most recent cycle where this pig was the sow, as long as it's still
  // open — actively gestating, or farrowed but its litter hasn't been
  // recorded yet — is what drives the "Gestation milestones" card below.
  // A returned-to-heat or fully-closed-out (litter recorded) cycle has
  // nothing left to track, so the card just doesn't render for those.
  const latestSowBreeding = relatedBreeding.find(
    (b) => b.sowTag === pig!.tag && b.status !== "returned-to-heat" && !b.litterRecorded
  );
  const recentMedical = [...medical].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);

  const s = STATUS_STYLE[pig!.status] ?? { cls: "muted", label: pig!.status };
  const g = growthStatus(pig!, growthRules);
  const ttm = timeToMarket(pig!, growthRules);

  const weightLog = Array.isArray(pig!.weightLog) ? (pig!.weightLog as { date: string; weightKg: number }[]) : [];
  const weightPoints: LinePoint[] = weightLog.map((e) => ({
    label: fmtDateShort(new Date(e.date)),
    value: kgToDisplay(e.weightKg, unit),
  }));
  // Most-recent-first log of each weigh-in against the one before it, so
  // the profile shows exactly what changed and by how much whenever a new
  // weight is recorded (via the edit form) — the chart above shows the
  // trend, this shows the actual entries it's built from.
  const weightLogRows = weightLog
    .map((entry, i) => ({ ...entry, prevWeightKg: i > 0 ? weightLog[i - 1].weightKg : null }))
    .reverse();

  const ageText = pig!.dob ? ageLabel(pig!.dob) : pig!.acquiredDate ? `${ageLabel(pig!.acquiredDate)}*` : "—";

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-ink flex items-center gap-2 min-w-0">
              <Icon name="pig" className="w-5 h-5 text-accent shrink-0" />
              <span className="break-words">{pig!.name}</span>
            </h1>
            <span className={`badge badge-${s.cls}`}>
              <span className="badge-dot" />
              {s.label}
            </span>
          </div>
          <p className="text-ink-soft text-sm tag">{pig!.tag}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {isManager && (
            <Link href={`/app/pigs/${encodeURIComponent(pig!.tag)}/edit`} className="btn btn-primary">
              <Icon name="pencil" className="w-3.5 h-3.5" />
              Edit
            </Link>
          )}
          <Link href="/app/pigs" className="btn">
            Back
          </Link>
        </div>
      </div>

      {stageSynced && <div className="mb-4 text-sm text-good bg-accent-soft rounded-lg px-3 py-2">Stage updated.</div>}

      {g && g.stageMismatch && (
        <div className="mb-4 text-sm rounded-lg px-3 py-2.5 bg-[#fdecc8] text-[#7a4a08] flex items-center justify-between gap-3 flex-wrap">
          <span>
            <b>
              {pig!.name}&apos;s {pig!.dob ? "age" : "weight"} now matches {STAGE_LABEL[g.autoStage]}
            </b>{" "}
            — currently recorded as {s.label.toLowerCase()}.
          </span>
          {isManager && (
            <form action={syncPigStageAction}>
              <input type="hidden" name="tag" value={pig!.tag} />
              <input type="hidden" name="newStage" value={g.autoStage} />
              <button type="submit" className="btn btn-small">
                Move to {STAGE_LABEL[g.autoStage]}
              </button>
            </form>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-3.5">
        <div className="card stat-tile p-[17px_18px]">
          <div className="k">
            <Icon name="scale" />
            Weight
          </div>
          <div className="v num">{fmtWeight(pig!.currentWeightKg, unit)}</div>
        </div>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k">
            <Icon name="calendar" />
            {pig!.dob ? "Age" : "Time on farm"}
          </div>
          <div className="v num">{ageText}</div>
          {!pig!.dob && pig!.acquiredDate && <div className="d">from acquired date — growth is tracked by weight instead</div>}
        </div>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k">
            <Icon name="trend" />
            Growth
          </div>
          <div className="v" style={{ fontSize: 17 }}>
            {g ? (
              <span className={`badge badge-${g.cls}`}>
                {g.label} · {g.pct}%
              </span>
            ) : (
              <span className="badge badge-muted">—</span>
            )}
          </div>
        </div>
      </div>

      {latestSowBreeding && (
        <div className="card p-5 mb-3.5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="font-semibold text-[15.5px]">Gestation milestones</h3>
            <span className="text-[11.5px] text-muted">
              × {latestSowBreeding.boarName ?? latestSowBreeding.boarTag ?? "unknown boar"} · mated {fmtDate(latestSowBreeding.matingDate)}
            </span>
          </div>
          <div className="flex flex-col">
            {gestationMilestones(latestSowBreeding, new Date()).map((m, i, arr) => {
              const badgeCls = m.state === "done" ? "good" : m.state === "due" ? "warn" : "muted";
              const badgeText = m.state === "done" ? "done" : m.state === "due" ? "due" : "upcoming";
              return (
                <div key={m.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`w-3 h-3 rounded-full shrink-0 ${m.state === "done" ? "bg-good" : m.state === "due" ? "bg-warn" : "bg-border"}`} />
                    {i < arr.length - 1 && <span className="w-px flex-1 bg-border" style={{ minHeight: 20 }} />}
                  </div>
                  <div className="pb-5 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-sm font-semibold">
                        {m.label}
                        {m.key !== "mated" && <span className="text-muted font-normal"> (Day {m.day})</span>}
                      </div>
                      <span className={`badge badge-${badgeCls}`}>{badgeText}</span>
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {m.state === "done" && m.doneDate ? `Confirmed ${fmtDate(m.doneDate)}` : `Target: ${fmtDate(m.targetDate)}`}
                    </div>

                    {m.key === "check" && m.state === "due" && (
                      <div className="flex gap-2 mt-2">
                        <form action={confirmPregnancyCheckAction}>
                          <input type="hidden" name="breedingId" value={latestSowBreeding.id} />
                          <input type="hidden" name="result" value="pregnant" />
                          <button type="submit" className="btn btn-small btn-primary">
                            Still pregnant
                          </button>
                        </form>
                        <form action={confirmPregnancyCheckAction}>
                          <input type="hidden" name="breedingId" value={latestSowBreeding.id} />
                          <input type="hidden" name="result" value="returned-to-heat" />
                          <button type="submit" className="btn btn-small btn-danger">
                            Returned to heat
                          </button>
                        </form>
                      </div>
                    )}

                    {(m.key === "pen" || m.key === "prep") && m.state === "due" && (
                      <form action={markGestationMilestoneAction} className="mt-2">
                        <input type="hidden" name="breedingId" value={latestSowBreeding.id} />
                        <input type="hidden" name="milestone" value={m.key} />
                        <button type="submit" className="btn btn-small">
                          Mark done
                        </button>
                      </form>
                    )}

                    {m.key === "farrow" && m.state === "done" && (
                      <div className="text-xs mt-1">
                        Litter #{latestSowBreeding.litterNumber ?? "?"} — {latestSowBreeding.litterSize ?? 0} born
                        {latestSowBreeding.litterSize && latestSowBreeding.litterSize > 0 && !latestSowBreeding.litterRecorded && isManager && (
                          <>
                            {" · "}
                            <Link href={`/app/breeding/${latestSowBreeding.id}/litter`} className="font-semibold text-accent">
                              Record the litter →
                            </Link>
                          </>
                        )}
                      </div>
                    )}

                    {m.key === "farrow" && m.state !== "done" && isManager && (
                      <details className="relative mt-2">
                        <summary className="btn btn-small cursor-pointer list-none">Log farrowing outcome</summary>
                        <form
                          action={logFarrowOutcomeAction}
                          className="card p-4 absolute left-0 z-10 w-72 mt-2 space-y-2 text-left"
                        >
                          <input type="hidden" name="breedingId" value={latestSowBreeding.id} />
                          <div className="field">
                            <label>Farrow date</label>
                            <input type="date" name="actualFarrowDate" required />
                          </div>
                          <div className="field">
                            <label>Litter size</label>
                            <input type="number" min="0" name="litterSize" />
                          </div>
                          <div className="field">
                            <label>Piglets weaned</label>
                            <input type="number" min="0" name="pigletsWeaned" />
                          </div>
                          <div className="field">
                            <label>Total litter weight ({unitLabel})</label>
                            <input type="number" step="0.1" min="0" name="totalLitterWeightKg" />
                          </div>
                          <button type="submit" className="btn btn-primary btn-small w-full justify-center">
                            Save outcome
                          </button>
                        </form>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ttm && (
        <div className="card p-5 mb-3.5">
          <div className="flex items-center justify-between mb-3.5">
            <h3 className="font-semibold text-[15.5px]">Time to market</h3>
            <span className={`badge badge-${ttm.cls}`}>{ttm.label}</span>
          </div>
          <div className="fg-bar mb-4" style={{ height: 10 }}>
            <i className={ttm.cls === "good" ? "" : ttm.cls} style={{ width: `${ttm.timeProgressPct}%` }} />
          </div>
          <div className="flex flex-col gap-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Current stage</span>
              <span className="font-semibold">{ttm.stageLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Current weight</span>
              <span className="font-semibold num">{fmtWeight(ttm.currentWeightKg, unit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{ttm.ageRefIsDob ? "Expected range at this age" : "Expected range for this stage"}</span>
              <span className="font-semibold num">
                {fmtWeight(ttm.expectedMinWeightKg, unit)} – {fmtWeight(ttm.expectedMaxWeightKg, unit)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Market weight target</span>
              <span className="font-semibold num">
                {fmtWeight(ttm.marketMinWeightKg, unit)} – {fmtWeight(ttm.marketMaxWeightKg, unit)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{ttm.ageRefIsDob ? "Age" : "Time on farm"}</span>
              <span className="font-semibold num">
                {(ttm.ageDays / 7).toFixed(1)} weeks{!ttm.ageRefIsDob && " (from acquired date)"}
              </span>
            </div>
            {ttm.ageRefIsDob ? (
              <div className="flex justify-between">
                <span className="text-muted">{ttm.daysDiff >= 0 ? "Days past market age" : "Days until market age"}</span>
                <span className="font-semibold num">{Math.abs(ttm.daysDiff)}</span>
              </div>
            ) : (
              <div className="flex justify-between">
                <span className="text-muted">Growth rate</span>
                <span className="font-semibold num">
                  {ttm.actualAdgKgPerDay === null
                    ? "Not enough weigh-ins yet"
                    : `${fmtWeight(ttm.actualAdgKgPerDay * 7, unit)}/wk of ${fmtWeight((ttm.expectedAdgKgPerDay ?? 0) * 7, unit)}/wk expected`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card p-5 mb-3.5">
        <h2 className="font-bold text-ink mb-3.5">Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted">Breed</span>
            <span className="font-semibold">{pig!.breed || "—"}</span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted">Sex</span>
            <span className="font-semibold">{classifySex(pig!)}</span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted">Pen / location</span>
            <span className="font-semibold">{pig!.pen || "—"}</span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted">Date of birth</span>
            <span className="font-semibold num">{pig!.dob ? fmtDate(pig!.dob) : "Unknown"}</span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted">Acquired date</span>
            <span className="font-semibold num">{pig!.acquiredDate ? fmtDate(pig!.acquiredDate) : "N/A"}</span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted">Sire</span>
            {pig!.sireTag ? (
              <Link href={`/app/pigs/${encodeURIComponent(pig!.sireTag)}`} className="font-semibold text-accent">
                {pig!.sireTag}
              </Link>
            ) : (
              <span className="font-semibold">—</span>
            )}
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted">Dam</span>
            {pig!.damTag ? (
              <Link href={`/app/pigs/${encodeURIComponent(pig!.damTag)}`} className="font-semibold text-accent">
                {pig!.damTag}
              </Link>
            ) : (
              <span className="font-semibold">—</span>
            )}
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted">Target weight</span>
            <span className="font-semibold num">{pig!.targetWeightKg ? fmtWeight(pig!.targetWeightKg, unit) : "—"}</span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted">Target months to market</span>
            <span className="font-semibold num">{pig!.targetMonths ?? "—"}</span>
          </div>
        </div>
        {pig!.notes && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-muted text-xs uppercase tracking-wide font-bold mb-1.5">Notes</div>
            <p className="text-sm text-ink-soft">{pig!.notes}</p>
          </div>
        )}
      </div>

      <div className="card p-5 mb-3.5">
        <div className="flex items-center justify-between mb-3.5">
          <h3 className="font-semibold text-[15.5px]">Weight history</h3>
          <span className="text-[11.5px] text-muted">from recorded weigh-ins</span>
        </div>
        <LineChart points={weightPoints} valueFormat={(n) => `${n.toFixed(1)} ${unitLabel}`} variant="bar-line" />
        {weightLogRows.length > 0 && (
          <div className="mt-4 pt-1 border-t border-border flex flex-col">
            {weightLogRows.map((entry, i) => {
              const deltaKg = entry.prevWeightKg !== null ? entry.weightKg - entry.prevWeightKg : null;
              return (
                <div key={`${entry.date}-${i}`} className="flex items-center justify-between gap-3 py-2.5 border-t border-border first:border-t-0 text-sm">
                  <span className="text-xs text-muted num shrink-0">{fmtDate(new Date(entry.date))}</span>
                  <span className="font-semibold num text-right flex-1 truncate">
                    {entry.prevWeightKg !== null ? (
                      <>
                        {fmtWeight(entry.prevWeightKg, unit)} <span className="text-muted font-normal">→</span> {fmtWeight(entry.weightKg, unit)}
                      </>
                    ) : (
                      fmtWeight(entry.weightKg, unit)
                    )}
                  </span>
                  <span
                    className={`text-xs font-semibold num shrink-0 w-[92px] text-right ${
                      deltaKg === null || deltaKg === 0 ? "text-muted" : deltaKg > 0 ? "text-good" : "text-critical"
                    }`}
                  >
                    {deltaKg === null ? "First weigh-in" : fmtWeightDelta(deltaKg, unit)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {recentMedical.length > 0 && (
        <div className="card p-5 mb-3.5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[15.5px]">Recent medical records</h3>
            <Link href="/app/medical" className="text-[12px] font-semibold text-accent">
              View all
            </Link>
          </div>
          <div className="flex flex-col">
            {recentMedical.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2.5 border-t border-border first:border-t-0">
                <div>
                  <div className="text-sm font-semibold">{m.type}</div>
                  <div className="text-xs text-muted">{m.description}</div>
                </div>
                <span className="text-xs text-muted num">{fmtDate(m.date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {relatedBreeding.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[15.5px]">Breeding history</h3>
            <Link href="/app/breeding" className="text-[12px] font-semibold text-accent">
              View all
            </Link>
          </div>
          <div className="flex flex-col">
            {relatedBreeding.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2.5 border-t border-border first:border-t-0">
                <div>
                  <div className="text-sm font-semibold">
                    {b.sowTag === pig!.tag ? `× ${b.boarName ?? b.boarTag ?? "unknown boar"}` : `× ${b.sowName ?? b.sowTag}`}
                  </div>
                  <div className="text-xs text-muted">{b.actualFarrowDate ? `Farrowed ${fmtDate(b.actualFarrowDate)}` : `Expected ${fmtDate(b.expectedFarrowDate)}`}</div>
                </div>
                <span className="badge badge-muted">{b.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
