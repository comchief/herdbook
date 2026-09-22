import { requireSession } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Donut, LineChart, categoricalColor } from "@/components/charts";
import { herdWeightTrend, herdComposition } from "@/lib/dashboard-charts";
import { fmtDate } from "@/lib/format";
import { kgToDisplay, weightUnitLabel, fmtWeight } from "@/lib/units";

function fmtMoney(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export default async function DashboardPage() {
  const session = await requireSession();
  const farm = await requireActiveFarm(session);
  const isManager = session.role !== "worker";
  const farmId = session.farmId;
  const unit = farm.unit === "lbs" ? "lbs" : "kg";
  const unitLabel = weightUnitLabel(unit);

  const [pigs, breeding, medical, feedInventory, sales, expenses, feedLogs] = await Promise.all([
    db.select().from(schema.pigs).where(eq(schema.pigs.farmId, farmId)),
    db.select().from(schema.breedingRecords).where(eq(schema.breedingRecords.farmId, farmId)),
    db.select().from(schema.medicalRecords).where(eq(schema.medicalRecords.farmId, farmId)),
    db.select().from(schema.feedInventory).where(eq(schema.feedInventory.farmId, farmId)),
    db.select().from(schema.sales).where(eq(schema.sales.farmId, farmId)),
    db.select().from(schema.expenses).where(eq(schema.expenses.farmId, farmId)),
    db.select().from(schema.feedLogs).where(eq(schema.feedLogs.farmId, farmId)),
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
        sub: `${fmtWeight(f.stockKg, unit, 0)} on hand · reorder at ${fmtWeight(f.reorderLevelKg, unit, 0)}`,
        cls: "critical",
        href: "/app/feed",
      });
    }
  }

  const weightTrend = herdWeightTrend(pigs).map((p) => ({ ...p, value: kgToDisplay(p.value, unit) }));
  const composition = herdComposition(pigs);

  const yr = today.getFullYear().toString();
  const ytdExpenses = expenses.filter((e) => e.date.getFullYear().toString() === yr).reduce((s, e) => s + e.amount, 0);
  const ytdFeedCost = feedLogs
    .filter((l) => l.direction === "purchase" && l.date.getFullYear().toString() === yr)
    .reduce((s, l) => s + l.costTotal, 0);
  const ytdVetCost = medical.filter((m) => m.date.getFullYear().toString() === yr).reduce((s, m) => s + m.cost, 0);
  const ytdRevenue = sales.filter((s) => s.date.getFullYear().toString() === yr).reduce((s, x) => s + x.revenue, 0);
  const allCosts = ytdExpenses + ytdFeedCost + ytdVetCost;

  const expenseByCategory = new Map<string, number>();
  for (const e of expenses.filter((e) => e.date.getFullYear().toString() === yr)) {
    expenseByCategory.set(e.category, (expenseByCategory.get(e.category) ?? 0) + e.amount);
  }
  if (ytdFeedCost > 0) expenseByCategory.set("feed", (expenseByCategory.get("feed") ?? 0) + ytdFeedCost);
  if (ytdVetCost > 0) expenseByCategory.set("vet", (expenseByCategory.get("vet") ?? 0) + ytdVetCost);
  const expenseSlices = [...expenseByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label: label[0].toUpperCase() + label.slice(1), value }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
        <p className="text-ink-soft text-sm">Here&apos;s how {farm.name} is doing today.</p>
      </div>

      <div className={`grid ${isManager ? "grid-cols-4" : "grid-cols-3"} gap-3.5 mb-4`}>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="pig" />Total herd</div>
          <div className="v num">{pigs.length}</div>
        </div>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="heart" />Pregnant sows</div>
          <div className="v num">{pregnant.length}</div>
        </div>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="wheat" />Feed on hand</div>
          <div className="v num">{fmtWeight(totalFeedKg, unit, 0)}</div>
        </div>
        {isManager && (
          <div className="card stat-tile p-[17px_18px]">
            <div className="k"><Icon name="tag" />Revenue, this month</div>
            <div className="v num">{fmtMoney(revenueThisMonth, farm.currency)}</div>
          </div>
        )}
      </div>

      <div className={`grid ${isManager ? "grid-cols-2" : "grid-cols-1"} gap-3.5 mb-3.5 items-stretch`}>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3.5">
            <h3 className="font-semibold text-[15.5px]">Herd weight trend</h3>
            <span className="text-[11.5px] text-muted">recorded biomass, by month</span>
          </div>
          <LineChart points={weightTrend} valueFormat={(n) => `${n.toLocaleString()} ${unitLabel}`} />
        </div>
        {isManager && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="font-semibold text-[15.5px]">Herd composition</h3>
              <span className="text-[11.5px] text-muted num">{pigs.length} pigs</span>
            </div>
            <Donut slices={composition} centerLabel={String(pigs.length)} centerSub="pigs" />
          </div>
        )}
      </div>

      <div className="card p-5 mb-3.5">
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

      {isManager && (
        <div className="grid grid-cols-2 gap-3.5">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="font-semibold text-[15.5px]">Revenue vs. expenses</h3>
              <span className="text-[11.5px] text-muted">year to date</span>
            </div>
            <Donut
              slices={[
                { label: "Revenue", value: ytdRevenue, color: categoricalColor(0) },
                { label: "Expenses", value: allCosts, color: categoricalColor(1) },
              ]}
              centerLabel={fmtMoney(ytdRevenue - allCosts, farm.currency)}
              centerSub={ytdRevenue - allCosts >= 0 ? "profit" : "loss"}
              valueFormat={(n) => fmtMoney(n, farm.currency)}
            />
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="font-semibold text-[15.5px]">Where the money goes</h3>
              <span className="text-[11.5px] text-muted">expenses by category, YTD</span>
            </div>
            <Donut
              slices={expenseSlices}
              centerLabel={fmtMoney(allCosts, farm.currency)}
              centerSub="total"
              valueFormat={(n) => fmtMoney(n, farm.currency)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
