import { requireSession } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { createMedicalAction, dismissFollowupAction, deleteMedicalAction } from "@/lib/actions/medical";
import { Icon } from "@/components/icons";
import { fmtDate } from "@/lib/format";
import { MedicalTypeFields } from "@/components/medical-type-fields";

export default async function MedicalPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  await requireActiveFarm(session);
  const { error } = await searchParams;
  const isManager = session.role !== "worker";

  const [records, pigs, medications] = await Promise.all([
    db.select().from(schema.medicalRecords).where(eq(schema.medicalRecords.farmId, session.farmId)).orderBy(desc(schema.medicalRecords.date)),
    db.select().from(schema.pigs).where(eq(schema.pigs.farmId, session.farmId)),
    db.select().from(schema.medications).where(eq(schema.medications.farmId, session.farmId)).orderBy(schema.medications.name),
  ]);

  const now = new Date();
  const yr = now.getFullYear().toString();
  const dueSoon = records.filter((m) => m.nextDueDate && Math.round((m.nextDueDate.getTime() - now.getTime()) / 86400000) <= 14).length;
  const recordsThisYear = records.filter((m) => m.date.getFullYear().toString() === yr).length;
  const vetSpendYtd = records.filter((m) => m.date.getFullYear().toString() === yr).reduce((s, m) => s + m.cost, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink mb-1">Health &amp; medical</h1>
      <p className="text-ink-soft text-sm mb-6">Vaccinations, treatments and check-ups across the herd.</p>
      {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-6">
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="alert" />Follow-ups due (14 days)</div>
          <div className="v num">{dueSoon}</div>
        </div>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="cross" />Records this year</div>
          <div className="v num">{recordsThisYear}</div>
        </div>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="tag" />Vet spend, this year</div>
          <div className="v num">${vetSpendYtd.toFixed(0)}</div>
        </div>
      </div>

      <div className="card p-5 mb-6">
        <h2 className="font-bold mb-3">Log a record</h2>
        <form action={createMedicalAction} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 items-end">
          <div className="field">
            <label>Pig</label>
            <select name="pigTag" required>
              {pigs.map((p) => (
                <option key={p.id} value={p.tag}>
                  {p.name} ({p.tag})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" name="date" required />
          </div>
          <MedicalTypeFields medications={medications} />
          <div className="field col-span-2 md:col-span-3">
            <label>Description</label>
            <textarea name="description" required rows={2} placeholder="e.g. Erysipelas booster, left flank" />
          </div>
          <div className="field">
            <label>Given by</label>
            <input name="administeredBy" placeholder="Dr. Alvarez" />
          </div>
          <div className="field">
            <label>Cost</label>
            <input type="number" step="0.01" min="0" name="cost" placeholder="22.00" />
          </div>
          <div className="field">
            <label>Next due (optional)</label>
            <input type="date" name="nextDueDate" />
          </div>
          <div className="col-span-2 md:col-span-3">
            <button type="submit" className="btn btn-primary">
              Save record
            </button>
          </div>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>Pig</th>
              <th>Date</th>
              <th>Type</th>
              <th>Description</th>
              <th>Next due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.map((m) => (
              <tr key={m.id}>
                <td className="font-semibold">{m.pigName ?? m.pigTag}</td>
                <td>{fmtDate(m.date)}</td>
                <td>
                  <span className="badge badge-info">{m.type}</span>
                  {m.medicationName && <div className="text-[11px] text-muted mt-0.5 truncate">{m.medicationName}</div>}
                </td>
                <td className="max-w-xs truncate">{m.description}</td>
                <td>{fmtDate(m.nextDueDate)}</td>
                <td className="text-right whitespace-nowrap">
                  {m.nextDueDate && (
                    <form action={dismissFollowupAction} className="inline mr-1">
                      <input type="hidden" name="id" value={m.id} />
                      <button type="submit" className="btn btn-small">
                        Mark done
                      </button>
                    </form>
                  )}
                  {isManager && (
                    <form action={deleteMedicalAction} className="inline">
                      <input type="hidden" name="id" value={m.id} />
                      <button type="submit" className="btn btn-small btn-danger">
                        Delete
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-10">
                  No medical records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
