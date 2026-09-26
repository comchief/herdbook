import { requireManager } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { recordLitterAction } from "@/lib/actions/breeding";
import { fmtDate } from "@/lib/format";
import { weightUnitLabel } from "@/lib/units";

/** Step 2 of the litter workflow, reached from the "Record litter" button
 * on the breeding page or a sow's Gestation milestones card once farrowing
 * has been logged with a litter size > 0. One row per piglet — a tag, sex
 * and weight, prefilled with a suggested tag the farmer can edit — and
 * submitting creates all of them as real pig records at once, linked to
 * the sow and boar (see recordLitterAction in src/lib/actions/breeding.ts).
 * Manager/owner only, same as logging the outcome itself. */
export default async function RecordLitterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireManager();
  const farm = await requireActiveFarm(session);
  const unit = farm.unit === "lbs" ? "lbs" : "kg";
  const unitLabel = weightUnitLabel(unit);
  const { id } = await params;
  const { error } = await searchParams;

  const [record] = await db
    .select()
    .from(schema.breedingRecords)
    .where(and(eq(schema.breedingRecords.farmId, session.farmId), eq(schema.breedingRecords.id, id)))
    .limit(1);
  if (!record) notFound();
  if (record.litterRecorded) redirect("/app/breeding");
  if (!record.actualFarrowDate || !record.litterSize || record.litterSize <= 0) redirect("/app/breeding");

  const litterSize = record.litterSize;
  const rows = Array.from({ length: litterSize }, (_, i) => i);

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1 flex items-center gap-2">
            <Icon name="pig" className="w-5 h-5 text-accent" />
            Record litter
          </h1>
          <p className="text-ink-soft text-sm">
            {record.sowName ?? record.sowTag} × {record.boarName ?? record.boarTag ?? "unknown boar"} — litter #{record.litterNumber ?? "?"}, farrowed{" "}
            {fmtDate(record.actualFarrowDate)}
          </p>
        </div>
        <Link href="/app/breeding" className="btn shrink-0">
          Back
        </Link>
      </div>

      {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}

      <p className="text-sm text-muted mb-4">
        Enter each of the {litterSize} piglet{litterSize === 1 ? "" : "s"} below — a real pig record is created for each one, linked to {record.sowName ?? record.sowTag} as dam
        {record.boarTag ? ` and ${record.boarName ?? record.boarTag} as sire` : ""}. Suggested tags are pre-filled; edit any of them before saving.
      </p>

      <form action={recordLitterAction} className="card p-5 space-y-4">
        <input type="hidden" name="breedingId" value={record.id} />
        {rows.map((i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end pb-4 border-b border-border last:border-b-0 last:pb-0">
            <div className="field">
              <label>Piglet {i + 1} — ear tag</label>
              <input
                name={`piglet_${i}_tag`}
                required
                defaultValue={`${record.sowTag}-L${record.litterNumber ?? 1}-${i + 1}`}
              />
            </div>
            <div className="field">
              <label>Name</label>
              <input name={`piglet_${i}_name`} placeholder={`Piglet ${i + 1}`} />
            </div>
            <div className="field">
              <label>Sex</label>
              <select name={`piglet_${i}_sex`} required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </select>
            </div>
            <div className="field">
              <label>Weight ({unitLabel})</label>
              <input type="number" step="0.1" min="0.1" name={`piglet_${i}_weight`} required />
            </div>
          </div>
        ))}
        <div className="pt-2">
          <button type="submit" className="btn btn-primary">
            Save litter — create {litterSize} pig record{litterSize === 1 ? "" : "s"}
          </button>
        </div>
      </form>
    </div>
  );
}
