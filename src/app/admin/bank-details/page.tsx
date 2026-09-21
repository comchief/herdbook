import { db, schema } from "@/db";
import { updateBankDetailsAction } from "@/lib/actions/payments";

export default async function AdminBankDetailsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const [bank] = await db.select().from(schema.platformBankDetails).limit(1);

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-ink mb-1">Bank details</h1>
      <p className="text-ink-soft text-sm mb-6">Shown to every farm on their Billing page.</p>
      {saved && <div className="mb-4 text-sm text-good bg-accent-soft rounded-lg px-3 py-2">Saved.</div>}
      <form action={updateBankDetailsAction} className="card p-6 space-y-4">
        <div className="field">
          <label>Bank name</label>
          <input name="bankName" defaultValue={bank?.bankName ?? ""} placeholder="National Commercial Bank Jamaica" />
        </div>
        <div className="field">
          <label>Account name</label>
          <input name="accountName" defaultValue={bank?.accountName ?? ""} />
        </div>
        <div className="field">
          <label>Account number</label>
          <input name="accountNumber" defaultValue={bank?.accountNumber ?? ""} />
        </div>
        <div className="field">
          <label>Branch</label>
          <input name="branch" defaultValue={bank?.branch ?? ""} />
        </div>
        <div className="field">
          <label>Routing / SWIFT (for international transfers)</label>
          <input name="routingSwift" defaultValue={bank?.routingSwift ?? ""} />
        </div>
        <div className="field">
          <label>Extra instructions</label>
          <textarea name="instructions" rows={3} defaultValue={bank?.instructions ?? ""} placeholder="e.g. include your farm name as the transfer note" />
        </div>
        <button type="submit" className="btn btn-primary">
          Save
        </button>
      </form>
    </div>
  );
}
