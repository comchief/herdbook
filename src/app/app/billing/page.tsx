import { requireOwner } from "@/lib/auth";
import { loadFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { subscriptionStatus, daysRemaining, MONTHLY_PRICE_USD } from "@/lib/subscription";
import { submitPaymentAction } from "@/lib/actions/payments";
import { Icon } from "@/components/icons";
import { fmtDate } from "@/lib/format";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; submitted?: string }>;
}) {
  const session = await requireOwner();
  const farm = await loadFarm(session);
  const { error, submitted } = await searchParams;
  const status = subscriptionStatus(farm);

  const [bank] = await db.select().from(schema.platformBankDetails).limit(1);
  const payments = await db
    .select()
    .from(schema.paymentSubmissions)
    .where(eq(schema.paymentSubmissions.farmId, session.farmId))
    .orderBy(desc(schema.paymentSubmissions.createdAt));

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink mb-1">Billing</h1>
      <p className="text-ink-soft text-sm mb-6">${MONTHLY_PRICE_USD}/month, paid by bank transfer.</p>

      <div className="card p-5 mb-6">
        {status === "trialing" && (
          <div>
            <div className="badge badge-info mb-2">Free trial</div>
            <div className="text-lg font-bold">{daysRemaining(farm.trialEndsAt)} days left</div>
            <p className="text-sm text-ink-soft mt-1">Your trial ends {fmtDate(farm.trialEndsAt)}. Pay any time to keep access afterward.</p>
          </div>
        )}
        {status === "active" && (
          <div>
            <div className="badge badge-good mb-2">Active</div>
            <div className="text-lg font-bold">Paid through {fmtDate(farm.paidThroughDate!)}</div>
          </div>
        )}
        {status === "expired" && (
          <div>
            <div className="badge badge-critical mb-2">Access paused</div>
            <p className="text-sm text-ink-soft">
              Your trial (or paid period) has ended. Send a bank transfer using the details below, then submit the
              reference so we can confirm it and turn access back on.
            </p>
          </div>
        )}
      </div>

      {submitted && (
        <div className="mb-4 text-sm text-good bg-accent-soft rounded-lg px-3 py-2">
          Payment submitted — we&apos;ll confirm it within one business day.
        </div>
      )}
      {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}

      <div className="card p-5 mb-6">
        <h2 className="font-bold mb-3 flex items-center gap-2"><Icon name="card" className="w-4 h-4 text-muted" />Where to send payment</h2>
        {bank && bank.bankName ? (
          <div className="text-sm space-y-1 text-ink-soft">
            <div>
              <span className="font-semibold text-ink">Bank:</span> {bank.bankName}
            </div>
            <div>
              <span className="font-semibold text-ink">Account name:</span> {bank.accountName}
            </div>
            <div>
              <span className="font-semibold text-ink">Account number:</span> {bank.accountNumber}
            </div>
            {bank.branch && (
              <div>
                <span className="font-semibold text-ink">Branch:</span> {bank.branch}
              </div>
            )}
            {bank.routingSwift && (
              <div>
                <span className="font-semibold text-ink">Routing / SWIFT:</span> {bank.routingSwift}
              </div>
            )}
            {bank.instructions && <p className="pt-2 border-t border-border mt-2">{bank.instructions}</p>}
            <p className="pt-2 text-xs text-muted">${MONTHLY_PRICE_USD} covers one month. Send a multiple for several months at once.</p>
          </div>
        ) : (
          <p className="text-sm text-muted">Payment details haven&apos;t been set up yet — check back soon.</p>
        )}
      </div>

      <div className="card p-5 mb-6">
        <h2 className="font-bold mb-3">I&apos;ve made a transfer</h2>
        <form action={submitPaymentAction} className="grid grid-cols-2 gap-3 items-end">
          <div className="field">
            <label>Payer name</label>
            <input name="payerName" required placeholder="As shown on the transfer" />
          </div>
          <div className="field">
            <label>Bank reference / transaction #</label>
            <input name="bankReference" required />
          </div>
          <div className="field">
            <label>Months covered</label>
            <input type="number" min="1" name="periodMonths" defaultValue={1} />
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input name="note" />
          </div>
          <div className="col-span-2">
            <button type="submit" className="btn btn-primary">
              Submit for confirmation
            </button>
          </div>
        </form>
      </div>

      <div className="card divide-y divide-border">
        {payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between p-4 text-sm">
            <div>
              <div className="font-semibold">
                {p.periodMonths} month{p.periodMonths === 1 ? "" : "s"} · ref {p.bankReference}
              </div>
              <div className="text-xs text-muted">{fmtDate(p.createdAt)}</div>
            </div>
            <span
              className={`badge ${p.status === "approved" ? "badge-good" : p.status === "rejected" ? "badge-critical" : "badge-warn"}`}
            >
              {p.status}
            </span>
          </div>
        ))}
        {payments.length === 0 && <div className="p-4 text-sm text-muted text-center">No payments submitted yet.</div>}
      </div>
    </div>
  );
}
