import { requireManager } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { createSaleAction, deleteSaleAction } from "@/lib/actions/sales";
import { Icon } from "@/components/icons";
import { fmtDate } from "@/lib/format";
import { weightUnitLabel } from "@/lib/units";
import { fmtMoney } from "@/lib/currency";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireManager();
  const farm = await requireActiveFarm(session);
  const unit = farm.unit === "lbs" ? "lbs" : "kg";
  const unitLabel = weightUnitLabel(unit);
  const { error } = await searchParams;

  const [sales, pigs] = await Promise.all([
    db.select().from(schema.sales).where(eq(schema.sales.farmId, session.farmId)).orderBy(desc(schema.sales.date)),
    db.select().from(schema.pigs).where(eq(schema.pigs.farmId, session.farmId)),
  ]);

  const yr = new Date().getFullYear().toString();
  const ytdRevenue = sales.filter((s) => s.date.getFullYear().toString() === yr).reduce((s, x) => s + x.revenue, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink mb-1">Slaughter &amp; sales</h1>
      <p className="text-ink-soft text-sm mb-6">Animals that have left the farm.</p>
      {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6">
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="tag" />Revenue, year to date</div>
          <div className="v num">{fmtMoney(ytdRevenue, farm.currency)}</div>
        </div>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="pig" />Head sold, YTD</div>
          <div className="v num">{sales.filter((s) => s.date.getFullYear().toString() === yr).length}</div>
        </div>
      </div>

      <div className="card p-5 mb-6">
        <h2 className="font-bold mb-3">Record a sale</h2>
        <form action={createSaleAction} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="field">
            <label>Date</label>
            <input type="date" name="date" required />
          </div>
          <div className="field">
            <label>Pig</label>
            <select name="pigTag">
              <option value="">— unlisted —</option>
              {pigs.map((p) => (
                <option key={p.id} value={p.tag}>
                  {p.name} ({p.tag})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Channel</label>
            <select name="channel" defaultValue="live">
              <option value="live">Live sale</option>
              <option value="meat">Meat sale</option>
            </select>
          </div>
          <div className="field">
            <label>Buyer</label>
            <input name="buyer" />
          </div>
          <div className="field">
            <label>Live weight ({unitLabel})</label>
            <input type="number" step="0.1" min="0" name="liveWeightKg" />
          </div>
          <div className="field">
            <label>Carcass weight ({unitLabel})</label>
            <input type="number" step="0.1" min="0" name="carcassWeightKg" />
          </div>
          <div className="field">
            <label>Price / {unitLabel}</label>
            <input type="number" step="0.01" min="0" name="pricePerUnit" required />
          </div>
          <div>
            <button type="submit" className="btn btn-primary">
              Save sale
            </button>
          </div>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Pig</th>
              <th>Channel</th>
              <th>Buyer</th>
              <th className="num">Revenue</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id}>
                <td>{fmtDate(s.date)}</td>
                <td className="tag">{s.pigTag || "—"}</td>
                <td>
                  <span className="badge badge-muted">{s.channel}</span>
                </td>
                <td>{s.buyer || "—"}</td>
                <td className="font-semibold num">{fmtMoney(s.revenue, farm.currency)}</td>
                <td className="text-right">
                  <form action={deleteSaleAction} className="inline">
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="btn btn-small btn-danger">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-10">
                  No sales recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
