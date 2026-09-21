import { requireSession } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import {
  createRationAction,
  updateRationAction,
  logFeedMovementAction,
  deleteFeedLogAction,
  assignPenFeedAction,
} from "@/lib/actions/feed";

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  await requireActiveFarm(session);
  const { error } = await searchParams;
  const isManager = session.role !== "worker";

  const [inventory, logs, pigs] = await Promise.all([
    db.select().from(schema.feedInventory).where(eq(schema.feedInventory.farmId, session.farmId)),
    db.select().from(schema.feedLogs).where(eq(schema.feedLogs.farmId, session.farmId)).orderBy(desc(schema.feedLogs.date)),
    db.select().from(schema.pigs).where(eq(schema.pigs.farmId, session.farmId)),
  ]);

  const pens = new Map<string, typeof pigs>();
  for (const p of pigs) {
    const pen = p.pen || "Unassigned";
    if (!pens.has(pen)) pens.set(pen, []);
    pens.get(pen)!.push(p);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink mb-1">Feed management</h1>
      <p className="text-ink-soft text-sm mb-6">Stock levels, reorder points and consumption.</p>
      {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}

      <div className="card p-5 mb-6">
        <h2 className="font-bold mb-3">Inventory on hand</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {inventory.map((f) => (
            <div key={f.id} className="border border-border rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm">{f.feedType}</div>
                <div className={`text-xs ${f.stockKg < f.reorderLevelKg ? "text-critical font-semibold" : "text-muted"}`}>
                  {f.stockKg.toFixed(0)} kg on hand · reorder at {f.reorderLevelKg.toFixed(0)} kg
                </div>
              </div>
              {isManager && (
                <details className="relative">
                  <summary className="btn btn-small cursor-pointer list-none">Edit</summary>
                  <form action={updateRationAction} className="card p-4 absolute right-0 z-10 w-60 mt-2 space-y-2 text-left">
                    <input type="hidden" name="id" value={f.id} />
                    <div className="field">
                      <label>Stock (kg)</label>
                      <input type="number" step="1" name="stockKg" defaultValue={f.stockKg} />
                    </div>
                    <div className="field">
                      <label>Reorder at (kg)</label>
                      <input type="number" step="1" name="reorderLevelKg" defaultValue={f.reorderLevelKg} />
                    </div>
                    <div className="field">
                      <label>Cost / kg</label>
                      <input type="number" step="0.01" name="costPerKg" defaultValue={f.costPerKg} />
                    </div>
                    <button type="submit" className="btn btn-primary btn-small w-full justify-center">
                      Save
                    </button>
                  </form>
                </details>
              )}
            </div>
          ))}
          {inventory.length === 0 && <div className="text-sm text-muted">No rations yet.</div>}
        </div>
        {isManager && (
          <details className="mt-4">
            <summary className="btn btn-small cursor-pointer list-none inline-block">+ New ration</summary>
            <form action={createRationAction} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end mt-3">
              <div className="field">
                <label>Ration name</label>
                <input name="feedType" required placeholder="Grower pellets" />
              </div>
              <div className="field">
                <label>Starting stock (kg)</label>
                <input type="number" step="1" min="0" name="stockKg" />
              </div>
              <div className="field">
                <label>Reorder at (kg)</label>
                <input type="number" step="1" min="0" name="reorderLevelKg" />
              </div>
              <div className="field">
                <label>Cost / kg</label>
                <input type="number" step="0.01" min="0" name="costPerKg" />
              </div>
              <div className="col-span-2 md:col-span-4">
                <button type="submit" className="btn btn-primary">
                  Add ration
                </button>
              </div>
            </form>
          </details>
        )}
      </div>

      <div className="card p-5 mb-6">
        <h2 className="font-bold mb-1">Feeding calendar</h2>
        <p className="text-xs text-muted mb-3">Daily amount per pen, rolled up from each pig&apos;s feeding plan.</p>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Pen</th>
                <th>Pigs on plan</th>
                <th>Ration(s)</th>
                <th>Daily total</th>
                {isManager && <th></th>}
              </tr>
            </thead>
            <tbody>
              {[...pens.entries()].map(([penName, penPigs]) => {
                const onPlan = penPigs.filter((p) => p.feedRation && (p.dailyFeedKg ?? 0) > 0);
                const rationNames = [...new Set(onPlan.map((p) => p.feedRation!))];
                const dailyKg = onPlan.reduce((s, p) => s + (p.dailyFeedKg ?? 0), 0);
                return (
                  <tr key={penName}>
                    <td className="font-semibold">{penName}</td>
                    <td>
                      {onPlan.length} / {penPigs.length}
                    </td>
                    <td>{rationNames.length === 0 ? "—" : rationNames.length === 1 ? rationNames[0] : "Mixed"}</td>
                    <td>{dailyKg.toFixed(1)} kg</td>
                    {isManager && (
                      <td className="text-right">
                        <details className="relative inline-block">
                          <summary className="btn btn-small cursor-pointer list-none">Assign feeding</summary>
                          <form
                            action={assignPenFeedAction}
                            className="card p-4 absolute right-0 z-10 w-80 mt-2 space-y-2 text-left max-h-80 overflow-y-auto"
                          >
                            {penPigs.map((p) => (
                              <div key={p.id} className="flex gap-2 items-end border-b border-border pb-2 last:border-b-0">
                                <input type="hidden" name="pigId" value={p.id} />
                                <div className="field flex-1">
                                  <label>{p.name}</label>
                                  <select name="feedRation" defaultValue={p.feedRation ?? ""}>
                                    <option value="">—</option>
                                    {inventory.map((f) => (
                                      <option key={f.id} value={f.feedType}>
                                        {f.feedType}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="field w-24">
                                  <label>kg/day</label>
                                  <input type="number" step="0.1" min="0" name="dailyFeedKg" defaultValue={p.dailyFeedKg ?? ""} />
                                </div>
                              </div>
                            ))}
                            <button type="submit" className="btn btn-primary btn-small w-full justify-center">
                              Save assignments
                            </button>
                          </form>
                        </details>
                      </td>
                    )}
                  </tr>
                );
              })}
              {pens.size === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-8">
                    No pigs yet — add pigs to a pen first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isManager && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold">Feed movements</h2>
            <details className="relative">
              <summary className="btn btn-primary btn-small cursor-pointer list-none">+ Log purchase / usage</summary>
              <form action={logFeedMovementAction} className="card p-4 absolute right-0 z-10 w-80 mt-2 space-y-2 text-left">
                <div className="field">
                  <label>Ration</label>
                  <select name="feedType" required>
                    {inventory.map((f) => (
                      <option key={f.id} value={f.feedType}>
                        {f.feedType}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Movement</label>
                  <select name="direction" defaultValue="purchase">
                    <option value="purchase">Purchase (adds stock)</option>
                    <option value="usage">Usage (removes stock)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Date</label>
                  <input type="date" name="date" required />
                </div>
                <div className="field">
                  <label>Quantity (kg)</label>
                  <input type="number" step="1" min="0" name="quantityKg" required />
                </div>
                <div className="field">
                  <label>Cost, if purchase</label>
                  <input type="number" step="0.01" min="0" name="costTotal" />
                </div>
                <button type="submit" className="btn btn-primary btn-small w-full justify-center">
                  Save movement
                </button>
              </form>
            </details>
          </div>
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ration</th>
                  <th>Movement</th>
                  <th>Quantity</th>
                  <th>Cost</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{fmtDate(l.date)}</td>
                    <td>{l.feedType}</td>
                    <td>
                      <span className={`badge ${l.direction === "purchase" ? "badge-good" : "badge-muted"}`}>{l.direction}</span>
                    </td>
                    <td>{l.quantityKg.toFixed(0)} kg</td>
                    <td>{l.costTotal ? `$${l.costTotal.toFixed(2)}` : "—"}</td>
                    <td className="text-right">
                      <form action={deleteFeedLogAction} className="inline">
                        <input type="hidden" name="id" value={l.id} />
                        <button type="submit" className="btn btn-small btn-danger">
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-8">
                      No feed movements yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
