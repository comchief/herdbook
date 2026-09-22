import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { approvePaymentAction, rejectPaymentAction } from "@/lib/actions/payments";
import { Icon } from "@/components/icons";

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function AdminPaymentsPage() {
  const pending = await db
    .select({
      id: schema.paymentSubmissions.id,
      amountClaimed: schema.paymentSubmissions.amountClaimed,
      periodMonths: schema.paymentSubmissions.periodMonths,
      bankReference: schema.paymentSubmissions.bankReference,
      payerName: schema.paymentSubmissions.payerName,
      note: schema.paymentSubmissions.note,
      createdAt: schema.paymentSubmissions.createdAt,
      farmName: schema.farms.name,
    })
    .from(schema.paymentSubmissions)
    .innerJoin(schema.farms, eq(schema.paymentSubmissions.farmId, schema.farms.id))
    .where(eq(schema.paymentSubmissions.status, "pending"))
    .orderBy(desc(schema.paymentSubmissions.createdAt));

  const recent = await db
    .select({
      id: schema.paymentSubmissions.id,
      status: schema.paymentSubmissions.status,
      reviewedAt: schema.paymentSubmissions.reviewedAt,
      farmName: schema.farms.name,
      periodMonths: schema.paymentSubmissions.periodMonths,
    })
    .from(schema.paymentSubmissions)
    .innerJoin(schema.farms, eq(schema.paymentSubmissions.farmId, schema.farms.id))
    .orderBy(desc(schema.paymentSubmissions.createdAt))
    .limit(20);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink mb-1">Pending payments</h1>
      <p className="text-ink-soft text-sm mb-6">Confirm each bank transfer against your account before approving.</p>

      <div className="space-y-4 mb-8">
        {pending.map((p) => (
          <div key={p.id} className="card p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold flex items-center gap-2"><Icon name="receipt" className="w-4 h-4 text-muted" />{p.farmName}</div>
              <span className="badge badge-warn">pending</span>
            </div>
            <div className="text-sm text-ink-soft space-y-0.5 mb-3">
              <div>
                Claiming ${p.amountClaimed.toFixed(2)} for {p.periodMonths} month{p.periodMonths === 1 ? "" : "s"}
              </div>
              <div>Payer: {p.payerName}</div>
              <div>Reference: {p.bankReference}</div>
              {p.note && <div>Note: {p.note}</div>}
              <div className="text-xs text-muted">Submitted {fmtDate(p.createdAt)}</div>
            </div>
            <div className="flex gap-2">
              <form action={approvePaymentAction}>
                <input type="hidden" name="paymentId" value={p.id} />
                <button type="submit" className="btn btn-primary btn-small">
                  Approve
                </button>
              </form>
              <details className="relative">
                <summary className="btn btn-small btn-danger cursor-pointer list-none">Reject</summary>
                <form action={rejectPaymentAction} className="card p-3 absolute left-0 z-10 w-64 mt-2 space-y-2">
                  <input type="hidden" name="paymentId" value={p.id} />
                  <div className="field">
                    <label>Reason (optional)</label>
                    <input name="reviewNote" />
                  </div>
                  <button type="submit" className="btn btn-danger btn-small w-full justify-center">
                    Confirm reject
                  </button>
                </form>
              </details>
            </div>
          </div>
        ))}
        {pending.length === 0 && <div className="text-sm text-muted">No payments waiting for review.</div>}
      </div>

      <h2 className="font-bold mb-3">Recent activity</h2>
      <div className="card divide-y divide-border">
        {recent.map((r) => (
          <div key={r.id} className="flex items-center justify-between p-3 text-sm">
            <div>{r.farmName}</div>
            <span className={`badge ${r.status === "approved" ? "badge-good" : r.status === "rejected" ? "badge-critical" : "badge-warn"}`}>
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
