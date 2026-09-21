import { requireSession } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { eq, and, isNotNull } from "drizzle-orm";
import Link from "next/link";

function fmtMoney(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function DashboardPage() {
  const session = await requireSession();
  const farm = await requireActiveFarm(session);
  const isManager = session.role !== "worker";
  const farmId = session.farmId;

  const [pigs, breeding, medical, feedInventory, sales] = await Promise.all([
    db.select().from(schema.pigs).where(eq(schema.pigs.farmId, farmId)),
    db.select().from(schema.breedingRecords).where(eq(schema.breedingRecords.farmId, farmId)),
    db.select().from(schema.medicalRecords).where(and(eq(schema.medicalRecords.farmId, farmId), isNotNull(schema.medicalRecords.nextDueDate))),
    db.select().from(schema.feedInventory).where(eq(schema.feedInventory.farmId, farmId)),
    db.select().from(schema.sales).where(eq(schema.sales.farmId, farmId)),
  ]);

  const pregnant = breeding.filter((b) => !b.actualFarrowDate);
  const totalFeedKg = feedInventory.reduce((s, f) => s + f.stockKg, 0);
  const today = new Date();
  const ym = today.toISOString().slice(0, 7);
  const revenueThisMonth = sales
    .filter((s) => s.date.toISOString().slice(0, 7) === ym)
    .reduce((s, sale) => s + sale.revenue, 0);

  type Task = { title: string; sub: string; cls: "critical" | "warn"; href: string };
  const tasks: Task[] = [];
  for (const b of pregnant) {
    const d = daysBetween(today, b.expectedFarrowDate);
    if (d <= 30) {
      tasks.push({
        title: `${b.sowName ?? b.sowTag} due to farrow`,
        sub: `${d < 0 ? Math.abs(d) + " days overdue" : d === 0 ? "due today" : "in " + d + " days"} · ${fmtDate(b.expectedFarrowDate)}`,
        cls: d <= 7 ? "critical" : "warn",
        href: "/app/breeding",
      });
    }
  }
  for (const m of medical) {
    if (!m.nextDueDate) continue;
    const d = daysBetween(today, m.nextDueDate);
    if (d <= 14) {
      tasks.push({
        title: `${m.pigName ?? m.pigTag} — ${m.type} follow-up`,
        sub: `${d < 0 ? Math.abs(d) + " days overdue" : d === 0 ? "due today" : "in " + d + " days"} · ${fmtDate(m.nextDueDate)}`,
        cls: d < 0 ? "critical" : "warn",
        href: "/app/medical",
      });
    }
  }
  for (const f of feedInventory) {
    if (f.stockKg < f.reorderLevelKg) {
      tasks.push({
        title: `${f.feedType} below reorder point`,
        sub: `${f.stockKg.toFixed(0)} kg on hand · reorder at ${f.reorderLevelKg.toFixed(0)} kg`,
        cls: "critical",
        href: "/app/feed",
      });
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
        <p className="text-ink-soft text-sm">Here&apos;s how {farm.name} is doing today.</p>
      </div>

      <div className={`grid ${isManager ? "grid-cols-4" : "grid-cols-3"} gap-4 mb-6`}>
        <div className="card p-4">
          <div className="text-xs font-bold uppercase text-muted mb-1">Total herd</div>
          <div className="text-2xl font-bold">{pigs.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-bold uppercase text-muted mb-1">Pregnant sows</div>
          <div className="text-2xl font-bold">{pregnant.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-bold uppercase text-muted mb-1">Feed on hand</div>
          <div className="text-2xl font-bold">{totalFeedKg.toFixed(0)} kg</div>
        </div>
        {isManager && (
          <div className="card p-4">
            <div className="text-xs font-bold uppercase text-muted mb-1">Revenue, this month</div>
            <div className="text-2xl font-bold">{fmtMoney(revenueThisMonth, farm.currency)}</div>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-ink mb-3">Needs attention</h2>
        {tasks.length === 0 && <div className="text-sm text-muted py-6 text-center">Nothing needs attention right now.</div>}
        <div className="flex flex-col">
          {tasks.map((t, i) => (
            <Link
              key={i}
              href={t.href}
              className="flex items-center justify-between gap-3 py-3 border-t border-border first:border-t-0 hover:bg-surface-2 rounded-lg px-2 -mx-2"
            >
              <div>
                <div className="text-sm font-semibold">{t.title}</div>
                <div className="text-xs text-muted">{t.sub}</div>
              </div>
              <span className={`badge badge-${t.cls}`}>{t.cls === "critical" ? "overdue" : "upcoming"}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
