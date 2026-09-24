import { requireOwner } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { updateFarmSettingsAction } from "@/lib/actions/settings";
import { addBreedAction, renameBreedAction, deleteBreedAction } from "@/lib/actions/breeds";
import { addMedicationAction, updateMedicationAction, deleteMedicationAction } from "@/lib/actions/medications";
import { Icon } from "@/components/icons";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const session = await requireOwner();
  const farm = await requireActiveFarm(session);
  const { error, saved } = await searchParams;

  const [breeds, medications] = await Promise.all([
    db.select().from(schema.pigBreeds).where(eq(schema.pigBreeds.farmId, session.farmId)).orderBy(schema.pigBreeds.name),
    db.select().from(schema.medications).where(eq(schema.medications.farmId, session.farmId)).orderBy(schema.medications.name),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink mb-6 flex items-center gap-2"><Icon name="gear" className="w-5 h-5 text-accent" />Farm settings</h1>
      {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}
      {saved && <div className="mb-4 text-sm text-good bg-accent-soft rounded-lg px-3 py-2">Saved.</div>}

      <form action={updateFarmSettingsAction} className="card p-6 space-y-4 mb-6 max-w-md">
        <div className="field">
          <label>Farm name</label>
          <input name="farmName" defaultValue={farm.name} required />
        </div>
        <div className="field">
          <label>Currency</label>
          <select name="currency" defaultValue={farm.currency}>
            <option value="USD">US Dollar (USD)</option>
            <option value="JMD">Jamaican Dollar (JMD)</option>
            <option value="CAD">Canadian Dollar (CAD)</option>
            <option value="GBP">British Pound (GBP)</option>
          </select>
        </div>
        <div className="field">
          <label>Unit of measurement</label>
          <select name="unit" defaultValue={farm.unit}>
            <option value="kg">Kilograms (kg)</option>
            <option value="lbs">Pounds (lb)</option>
          </select>
        </div>
        <div className="field">
          <label>Farm location</label>
          <input name="location" defaultValue={farm.locationName ?? ""} placeholder="e.g. Kingston, Jamaica" />
          <p className="text-[11px] text-muted mt-1">
            Used to show the dashboard&apos;s greeting and weather in your farm&apos;s local time. Clear it to turn that off.
          </p>
        </div>
        <button type="submit" className="btn btn-primary">
          Save settings
        </button>
      </form>

      <div className="card p-5 mb-6">
        <h2 className="font-bold mb-1 flex items-center gap-2"><Icon name="pig" className="w-4 h-4 text-accent" />Pig breeds</h2>
        <p className="text-xs text-muted mb-4">
          Offered on the Breed dropdown when adding or editing a pig. Pre-loaded with the built-in breeds below —
          rename or delete any of them, or add your own.
        </p>

        {breeds.length > 0 && (
          <div className="rounded-lg border border-border divide-y divide-border mb-4">
            {breeds.map((b) => (
              <div key={b.id} className="flex items-center gap-2 p-2.5">
                <form action={renameBreedAction} className="flex items-center gap-2 flex-1 min-w-0">
                  <input type="hidden" name="id" value={b.id} />
                  <div className="field mb-0 flex-1 min-w-0">
                    <label className="sr-only">Breed name</label>
                    <input name="name" defaultValue={b.name} required />
                  </div>
                  <button type="submit" className="btn btn-small shrink-0">
                    Save
                  </button>
                </form>
                <form action={deleteBreedAction} className="shrink-0">
                  <input type="hidden" name="id" value={b.id} />
                  <button type="submit" className="btn btn-small btn-danger">
                    Delete
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
        {breeds.length === 0 && <p className="text-xs text-muted mb-4">No breeds saved — add one below.</p>}

        <form action={addBreedAction} className="flex items-end gap-2">
          <div className="field mb-0 flex-1">
            <label>Add a breed</label>
            <input name="name" required placeholder="e.g. Pietrain" />
          </div>
          <button type="submit" className="btn shrink-0">
            Add
          </button>
        </form>
      </div>

      <div className="card p-5">
        <h2 className="font-bold mb-1 flex items-center gap-2"><Icon name="pill" className="w-4 h-4 text-accent" />Medications</h2>
        <p className="text-xs text-muted mb-4">
          Kept on hand for this farm, with a note on what each is used for. Selectable from the health page whenever
          a &quot;Medication&quot; record is logged.
        </p>

        {medications.length > 0 && (
          <div className="rounded-lg border border-border divide-y divide-border mb-4">
            {medications.map((m) => (
              <div key={m.id} className="flex flex-col sm:flex-row sm:items-end gap-2 p-2.5">
                <form action={updateMedicationAction} className="flex flex-col sm:flex-row sm:items-end gap-2 flex-1 min-w-0">
                  <input type="hidden" name="id" value={m.id} />
                  <div className="field mb-0 sm:w-40 shrink-0">
                    <label className="sr-only">Medication name</label>
                    <input name="name" defaultValue={m.name} required placeholder="Name" />
                  </div>
                  <div className="field mb-0 flex-1 min-w-0">
                    <label className="sr-only">What it&apos;s used for</label>
                    <input name="use" defaultValue={m.use ?? ""} placeholder="What it's used for" />
                  </div>
                  <button type="submit" className="btn btn-small shrink-0">
                    Save
                  </button>
                </form>
                <form action={deleteMedicationAction} className="shrink-0">
                  <input type="hidden" name="id" value={m.id} />
                  <button type="submit" className="btn btn-small btn-danger">
                    Delete
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
        {medications.length === 0 && <p className="text-xs text-muted mb-4">No medications saved yet — add one below.</p>}

        <form action={addMedicationAction} className="flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="field mb-0 sm:w-40 shrink-0">
            <label>Name</label>
            <input name="name" required placeholder="e.g. Oxytetracycline" />
          </div>
          <div className="field mb-0 flex-1">
            <label>Used for</label>
            <input name="use" placeholder="e.g. Bacterial infections, respiratory disease" />
          </div>
          <button type="submit" className="btn shrink-0">
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
