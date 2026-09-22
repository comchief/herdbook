import { requireSession } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { createBreedingAction, logFarrowOutcomeAction, deleteBreedingAction } from "@/lib/actions/breeding";
import { Icon } from "@/components/icons";
import { fmtDate } from "@/lib/format";
import { weightUnitLabel } from "@/lib/units";

export default async function BreedingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  const farm = await requireActiveFarm(session);
  const unit = farm.unit === "lbs" ? "lbs" : "kg";
  const unitLabel = weightUnitLabel(unit);
  const { error } = await searchParams;
  const isManager = session.role !== "worker";

  const [records, pigs] = await Promise.all([
    db.select().from(schema.breedingRecords).where(eq(schema.breedingRecords.farmId, session.farmId)).orderBy(desc(schema.breedingRecords.matingDate)),
    db.select().from(schema.pigs).where(eq(schema.pigs.farmId, session.farmId)),
  ]);
  const sows = pigs.filter((p) => p.status === "breeding-sow" || (p.sexBase === "Female" && ["grower", "finisher"].includes(p.status)));
  const boars = pigs.filter((p) => p.status === "breeding-boar");

  const today = new Date();
  const yr = today.getFullYear().toString();
  const expecting = records.filter((b) => !b.actualFarrowDate);
  const dueSoon = expecting.filter((b) => Math.round((b.expectedFarrowDate.getTime() - today.getTime()) / 86400000) <= 30).length;
  const farrowedYtd = records.filter((b) => b.actualFarrowDate && b.actualFarrowDate.getFullYear().toString() === yr);
  const pigletsYtd = farrowedYtd.reduce((s, b) => s + (b.litterSize ?? 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink mb-1">Breeding &amp; pregnancy</h1>
      <p className="text-ink-soft text-sm mb-6">Matings, gestation countdowns and farrowing outcomes.</p>
      {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-6">
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="heart" />Expecting</div>
          <div className="v num">{expecting.length}</div>
        </div>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="alert" />Due within 30 days</div>
          <div className="v num">{dueSoon}</div>
        </div>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="pig" />Piglets born, YTD</div>
          <div className="v num">{pigletsYtd}</div>
          <div className="d">from {farrowedYtd.length} litter{farrowedYtd.length === 1 ? "" : "s"}</div>
        </div>
      </div>

      <div className="card p-5 mb-6">
        <h2 className="font-bold mb-3">Log a breeding</h2>
        <form action={createBreedingAction} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="field">
            <label>Sow</label>
            <select name="sowTag" required>
              {sows.map((s) => (
                <option key={s.id} value={s.tag}>
                  {s.name} ({s.tag})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Boar</label>
            <select name="boarTag">
              <option value="">— unknown —</option>
              {boars.map((b) => (
                <option key={b.id} value={b.tag}>
                  {b.name} ({b.tag})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Mating date</label>
            <input type="date" name="matingDate" required />
          </div>
          <div className="field">
            <label>Expected farrow</label>
            <input type="date" name="expectedFarrowDate" required />
          </div>
          <div className="col-span-2 md:col-span-4">
            <button type="submit" className="btn btn-primary">
              Log breeding
            </button>
          </div>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>Sow</th>
              <th>Boar</th>
              <th>Mated</th>
              <th>Expected farrow</th>
              <th>Outcome</th>
              {isManager && <th></th>}
            </tr>
          </thead>
          <tbody>
            {records.map((b) => (
              <tr key={b.id}>
                <td className="font-semibold">{b.sowName ?? b.sowTag}</td>
                <td>{b.boarName ?? b.boarTag ?? "—"}</td>
                <td>{fmtDate(b.matingDate)}</td>
                <td>{fmtDate(b.expectedFarrowDate)}</td>
                <td>
                  {b.actualFarrowDate ? (
                    <span className="badge badge-good">
                      {b.litterSize ?? 0} born · {fmtDate(b.actualFarrowDate)}
                    </span>
                  ) : (
                    <span className="badge badge-info">expecting</span>
                  )}
                </td>
                {isManager && (
                  <td className="text-right whitespace-nowrap">
                    {!b.actualFarrowDate && (
                      <details className="inline-block relative">
                        <summary className="btn btn-small cursor-pointer list-none">Log outcome</summary>
                        <form
                          action={logFarrowOutcomeAction}
                          className="card p-4 absolute right-0 z-10 w-72 mt-2 space-y-2 text-left"
                        >
                          <input type="hidden" name="breedingId" value={b.id} />
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
                    <form action={deleteBreedingAction} className="inline ml-1">
                      <input type="hidden" name="id" value={b.id} />
                      <button type="submit" className="btn btn-small btn-danger">
                        Delete
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-10">
                  No breeding records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
