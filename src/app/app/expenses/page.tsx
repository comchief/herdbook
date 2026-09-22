import { requireManager } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { createExpenseAction, deleteExpenseAction } from "@/lib/actions/expenses";
import { Icon } from "@/components/icons";

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtMoney(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireManager();
  const farm = await requireActiveFarm(session);
  const { error } = await searchParams;

  const [expenses, sales, feedLogs, medical] = await Promise.all([
    db.select().from(schema.expenses).where(eq(schema.expenses.farmId, session.farmId)).orderBy(desc(schema.expenses.date)),
    db.select().from(schema.sales).where(eq(schema.sales.farmId, session.farmId)),
    db.select().from(schema.feedLogs).where(eq(schema.feedLogs.farmId, session.farmId)),
    db.select().from(schema.medicalRecords).where(eq(schema.medicalRecords.farmId, session.farmId)),
  ]);

  const yr = new Date().getFullYear().toString();
  const ytdExpenses = expenses.filter((e) => e.date.getFullYear().toString() === yr).reduce((s, e) => s + e.amount, 0);
  const ytdFeedCost = feedLogs
    .filter((l) => l.direction === "purchase" && l.date.getFullYear().toString() === yr)
    .reduce((s, l) => s + l.costTotal, 0);
  const ytdVetCost = medical.filter((m) => m.date.getFullYear().toString() === yr).reduce((s, m) => s + m.cost, 0);
  const allYtdCosts = ytdExpenses + ytdFeedCost + ytdVetCost;
  const ytdRevenue = sales.filter((s) => s.date.getFullYear().toString() === yr).reduce((s, x) => s + x.revenue, 0);
  const profit = ytdRevenue - allYtdCosts;

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink mb-1">Expense tracker</h1>
      <p className="text-ink-soft text-sm mb-6">Purchases and operating costs for the farm.</p>
      {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="receipt" />Logged here, YTD</div>
          <div className="v num">{fmtMoney(ytdExpenses, farm.currency)}</div>
        </div>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="wheat" />All farm costs, YTD</div>
          <div className="v num">{fmtMoney(allYtdCosts, farm.currency)}</div>
          <div className="d">incl. feed &amp; vet costs</div>
        </div>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="tag" />Revenue, YTD</div>
          <div className="v num">{fmtMoney(ytdRevenue, farm.currency)}</div>
        </div>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="scale" />Profit / loss, YTD</div>
          <div className={`v num ${profit >= 0 ? "text-good" : "text-critical"}`}>{fmtMoney(profit, farm.currency)}</div>
        </div>
      </div>

      <div className="card p-5 mb-6">
        <h2 className="font-bold mb-3">Log an expense</h2>
        <form action={createExpenseAction} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="field">
            <label>Date</label>
            <input type="date" name="date" required />
          </div>
          <div className="field">
            <label>Category</label>
            <select name="category" defaultValue="supplies">
              <option value="supplies">Supplies</option>
              <option value="equipment">Equipment</option>
              <option value="utilities">Utilities</option>
              <option value="labor">Labor</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field col-span-2">
            <label>Description</label>
            <input name="description" required placeholder="e.g. Fence repair materials" />
          </div>
          <div className="field">
            <label>Vendor</label>
            <input name="vendor" />
          </div>
          <div className="field">
            <label>Amount</label>
            <input type="number" step="0.01" min="0.01" name="amount" required />
          </div>
          <div>
            <button type="submit" className="btn btn-primary">
              Save expense
            </button>
          </div>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Vendor</th>
              <th className="num">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td>{fmtDate(e.date)}</td>
                <td>
                  <span className="badge badge-muted">{e.category}</span>
                </td>
                <td>{e.description}</td>
                <td>{e.vendor || "—"}</td>
                <td className="font-semibold num">{fmtMoney(e.amount, farm.currency)}</td>
                <td className="text-right">
                  <form action={deleteExpenseAction} className="inline">
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="btn btn-small btn-danger">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-10">
                  No expenses logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
