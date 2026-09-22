import { requireSession } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { LineChart, type LinePoint } from "@/components/charts";
import { growthStatus, timeToMarket } from "@/lib/growth";
import { fmtDate, fmtDateShort } from "@/lib/format";
import { kgToDisplay, weightUnitLabel, fmtWeight } from "@/lib/units";
import { classifySex } from "@/lib/pig-classification";

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


export default async function PigProfilePage({ params }: { params: Promise<{ tag: string }> }) {
  const session = await requireSession();
  const farm = await requireActiveFarm(session);
  const unit = farm.unit === "lbs" ? "lbs" : "kg";
  const unitLabel = weightUnitLabel(unit);
  const isManager = session.role !== "worker";
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);

  const [pig] = await db
    .select()
    .from(schema.pigs)
    .where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.tag, decodedTag)))
    .limit(1);
  if (!pig) notFound();

  const [medical, breeding] = await Promise.all([
    db.select().from(schema.medicalRecords).where(and(eq(schema.medicalRecords.farmId, session.farmId), eq(schema.medicalRecords.pigTag, pig!.tag))),
    db
      .select()
      .from(schema.breedingRecords)
      .where(and(eq(schema.breedingRecords.farmId, session.farmId))),
  ]);
  const relatedBreeding = breeding
    .filter((b) => b.sowTag === pig!.tag || b.boarTag === pig!.tag)
    .sort((a, b) => b.matingDate.getTime() - a.matingDate.getTime());
  const recentMedical = [...medical].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);

  const s = STATUS_STYLE[pig!.status] ?? { cls: "muted", label: pig!.status };
  const g = growthStatus(pig!);
  const ttm = timeToMarket(pig!);

  const weightLog = Array.isArray(pig!.weightLog) ? (pig!.weightLog as { date: string; weightKg: number }[]) : [];
  const weightPoints: LinePoint[] = weightLog.map((e) => ({
    label: fmtDateShort(new Date(e.date)),
    value: kgToDisplay(e.weightKg, unit),
  }));

  const ageText = pig!.dob ? ageLabel(pig!.dob) : pig!.acquiredDate ? `${ageLabel(pig!.acquiredDate)}*` : "—";

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
              <Icon name="pig" className="w-5 h-5 text-accent" />
              {pig!.name}
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

      <div className="grid grid-cols-3 gap-3.5 mb-3.5">
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
            Age
          </div>
          <div className="v num">{ageText}</div>
          {!pig!.dob && pig!.acquiredDate && <div className="d">* approximate, from acquired date</div>}
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
              <span className="text-muted">Current</span>
              <span className="font-semibold num">
                {fmtWeight(ttm.currentWeightKg, unit)} of {fmtWeight(ttm.targetWeightKg, unit)} target ({ttm.weightPct}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Expected at this age</span>
              <span className="font-semibold num">{fmtWeight(ttm.expectedWeightKg, unit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Target</span>
              <span className="font-semibold">
                {ttm.targetMonths} months from {ttm.ageRefIsDob ? "birth" : "acquired date"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{ttm.daysDiff >= 0 ? "Days past target date" : "Days until target date"}</span>
              <span className="font-semibold num">{Math.abs(ttm.daysDiff)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="card p-5 mb-3.5">
        <h2 className="font-bold text-ink mb-3.5">Details</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
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
        <LineChart points={weightPoints} valueFormat={(n) => `${n.toFixed(1)} ${unitLabel}`} />
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
