import { requireOwner } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { updateFarmSettingsAction } from "@/lib/actions/settings";
import { Icon } from "@/components/icons";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const session = await requireOwner();
  const farm = await requireActiveFarm(session);
  const { error, saved } = await searchParams;

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold text-ink mb-6 flex items-center gap-2"><Icon name="gear" className="w-5 h-5 text-accent" />Farm settings</h1>
      {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}
      {saved && <div className="mb-4 text-sm text-good bg-accent-soft rounded-lg px-3 py-2">Settings saved.</div>}
      <form action={updateFarmSettingsAction} className="card p-6 space-y-4">
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
    </div>
  );
}
