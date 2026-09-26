import { requireSession, currentUserRecord } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Donut, LineChart, categoricalColor } from "@/components/charts";
import { herdWeightTrend, herdComposition } from "@/lib/dashboard-charts";
import { fmtDate } from "@/lib/format";
import { kgToDisplay, weightUnitLabel, fmtWeight } from "@/lib/units";
import { timeToMarket } from "@/lib/growth";
import { STAGE_LABEL } from "@/lib/growth-rules";
import { getGrowthStageRules } from "@/lib/growth-rules-db";
import { fmtMoney, fmtMoneyCompact, currencyFlag } from "@/lib/currency";
import { fetchCurrentWeather, localHour } from "@/lib/weather";
import { dailyConsumptionByRation } from "@/lib/feed-consumption";
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
/** Time-of-day greeting, in the farm's own local time (see localHour) —
 * not the server's, which runs in UTC and would otherwise say "Good
 * morning" to a farm that's had its evening chores done for hours. */
function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const session = await requireSession();
  const farm = await requireActiveFarm(session);
  const isManager = session.role !== "worker";
  const isOwner = session.role === "owner";
  const farmId = session.farmId;
  const unit = farm.unit === "lbs" ? "lbs" : "kg";
  const unitLabel = weightUnitLabel(unit);
  const hasLocation = farm.latitude != null && farm.longitude != null && !!farm.timezone;

  const [pigs, breeding, medical, feedInventory, sales, expenses, feedLogs, penFeedPlans, user, growthRules, weather] = await Promise.all([
    db.select().from(schema.pigs).where(eq(schema.pigs.farmId, farmId)),
    db.select().from(schema.breedingRecords).where(eq(schema.breedingRecords.farmId, farmId)),
    db.select().from(schema.medicalRecords).where(eq(schema.medicalRecords.farmId, farmId)),
    db.select().from(schema.feedInventory).where(eq(schema.feedInventory.farmId, farmId)),
    db.select().from(schema.sales).where(eq(schema.sales.farmId, farmId)),
    db.select().from(schema.expenses).where(eq(schema.expenses.farmId, farmId)),
    db.select().from(schema.feedLogs).where(eq(schema.feedLogs.farmId, farmId)),
    db.select().from(schema.penFeedPlans).where(eq(schema.penFeedPlans.farmId, farmId)),
    currentUserRecord(session),
    getGrowthStageRules(),
    hasLocation ? fetchCurrentWeather(farm.latitude!, farm.longitude!, farm.timezone!) : Promise.resolve(null),
  ]);
  const firstName = (user?.name ?? "there").split(" ")[0];
  const localHr = localHour(farm.timezone);

  const pregnant = breeding.filter((b) => !b.actualFarrowDate);
  const totalFeedKg = feedInventory.reduce((s, f) => s + f.stockKg, 0);
  const today = new Date();
  const ym = today.toISOString().slice(0, 7);
  const salesThisMonth = sales.filter((s) => s.date.toISOString().slice(0, 7) === ym);
  const revenueThisMonth = salesThisMonth.reduce((s, sale) => s + sale.revenue, 0);
  const breedingStockCount = pigs.filter((p) => p.status === "breeding-sow" || p.status === "breeding-boar").length;
  // "Ready for finishing" = grower/finisher pigs that have already reached
  // the admin-defined market weight band — a signal they're due to move
  // on, not just a status label.
  const readyForFinishing = pigs.filter(
    (p) => ["grower", "finisher"].includes(p.status) && p.currentWeightKg >= growthRules.finisher.endWeightMinKg
  ).length;
  const rationsBelowReorder = feedInventory.filter((f) => f.stockKg <= f.reorderLevelKg).length;

  // Feed runs-out estimate: farm-wide daily consumption per ration (per-pig
  // plans plus bulk pens' total/duration daily-equivalent — see
  // dailyConsumptionByRation), divided into that ration's stock on hand.
  // Surfaced as the most urgent ration, since that's the one that actually
  // forces a decision first.
  const consumptionRates = dailyConsumptionByRation(pigs, penFeedPlans);
  const todayStr = today.toISOString().slice(0, 10);
  let mostUrgentFeed: { feedType: string; daysLeft: number } | null = null;
  for (const f of feedInventory) {
    const rate = consumptionRates.get(f.feedType) ?? 0;
    if (rate <= 0) continue;
    const daysLeft = f.stockKg / rate;
    if (!mostUrgentFeed || daysLeft < mostUrgentFeed.daysLeft) mostUrgentFeed = { feedType: f.feedType, daysLeft };
  }

  // Pens grouped the same way the feeding calendar groups them (see
  // src/app/app/feed/page.tsx), so "was today's feeding logged" and "is
  // this bulk pen overdue" agree with what the Feed page itself shows.
  const feedPens = new Map<string, typeof pigs>();
  for (const p of pigs) {
    const pen = p.pen || "Unassigned";
    if (!feedPens.has(pen)) feedPens.set(pen, []);
    feedPens.get(pen)!.push(p);
  }
  const bulkPlanByPen = new Map(penFeedPlans.map((p) => [p.pen, p]));

  type Task = { title: string; sub: string; badge: string; cls: "critical" | "warn"; href: string };
  const tasks: Task[] = [];
  for (const [penName, penPigs] of feedPens) {
    const plan = bulkPlanByPen.get(penName);
    if (plan) {
      const daysLeft = plan.durationDays - daysBetween(plan.startDate, today);
      if (daysLeft <= 0) {
        tasks.push({
          title: `${penName} — bulk feeding due for a top-up`,
          sub: daysLeft === 0 ? `Due today · ${plan.feedType}` : `${Math.abs(daysLeft)} days overdue · ${plan.feedType}`,
          badge: daysLeft < 0 ? "overdue" : "upcoming",
          cls: daysLeft < 0 ? "critical" : "warn",
          href: "/app/feed",
        });
      }
    } else {
      const onPlan = penPigs.some((p) => p.feedRation && (p.dailyFeedKg ?? 0) > 0);
      if (!onPlan) continue;
      const loggedToday = feedLogs.some(
        (l) => l.pen === penName && l.source === "calendar" && l.date.toISOString().slice(0, 10) === todayStr
      );
      if (!loggedToday) {
        tasks.push({
          title: `${penName} — feeding not logged today`,
          sub: "Log today's feeding on the Feed page once it's done.",
          badge: "not logged",
          cls: "warn",
          href: "/app/feed",
        });
      }
    }
  }
  for (const b of pregnant) {
    const d = daysBetween(today, b.expectedFarrowDate);
    if (d <= 30) {
      tasks.push({
        title: `${b.sowName ?? b.sowTag} due to farrow`,
        sub: `${d < 0 ? Math.abs(d) + " days overdue" : d === 0 ? "due today" : "in " + d + " days"} · ${fmtDate(b.expectedFarrowDate)}`,
        badge: d < 0 ? "overdue" : "upcoming",
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
        badge: d < 0 ? "overdue" : "upcoming",
        cls: d < 0 ? "critical" : "warn",
        href: "/app/medical",
      });
    }
  }
  // Pigs falling behind (or past due) on the admin-defined growth-stage
  // weight bands — same On track/Behind[/Overdue] classification as the pig
  // profile's "Time to market" card, surfaced here so it's visible without
  // opening every pig. Also flags pigs whose recorded status no longer
  // matches the stage their age (or, with no dob, their weight) now puts
  // them in.
  for (const p of pigs) {
    const ttm = timeToMarket(
      { status: p.status, dob: p.dob, acquiredDate: p.acquiredDate, currentWeightKg: p.currentWeightKg, weightLog: p.weightLog },
      growthRules
    );
    if (!ttm) continue;
    if (ttm.label !== "On track") {
      tasks.push({
        title: `${p.name} ${ttm.label === "Overdue" ? "overdue" : "behind"} on ${ttm.stageLabel.toLowerCase()} weight`,
        sub: `${fmtWeight(ttm.currentWeightKg, unit)} of ${fmtWeight(ttm.expectedMinWeightKg, unit)} expected ${ttm.ageRefIsDob ? "at this age" : "for this stage"}`,
        badge: ttm.label,
        cls: ttm.cls === "critical" ? "critical" : "warn",
        href: `/app/pigs/${p.tag}`,
      });
    } else if (ttm.stageMismatch) {
      tasks.push({
        title: `${p.name} has grown into ${STAGE_LABEL[ttm.autoStage]}`,
        sub: `Currently recorded as ${p.status} — update its stage on the pig's profile.`,
        badge: "stage change",
        cls: "warn",
        href: `/app/pigs/${p.tag}`,
      });
    }
  }
  for (const f of feedInventory) {
    if (f.stockKg <= f.reorderLevelKg) {
      tasks.push({
        title: `${f.feedType} at or below reorder point`,
        sub: `${fmtWeight(f.stockKg, unit, 0)} on hand · reorder at ${fmtWeight(f.reorderLevelKg, unit, 0)}`,
        badge: "overdue",
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
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {greeting(localHr)}, {firstName}
          </h1>
          <p className="text-ink-soft text-sm">Here&apos;s how the herd is doing at {farm.name} today.</p>
        </div>
        {weather ? (
          <div className="card flex items-center gap-3 px-4 py-3">
            <Icon name={weather.icon} className="w-9 h-9 text-accent shrink-0" />
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-ink num">{Math.round(weather.tempC)}°C</span>
                <span className="text-sm text-ink-soft">{weather.label}</span>
              </div>
              <div className="text-[11.5px] text-muted flex items-center gap-1 mt-0.5">
                <Icon name="map-pin" className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {farm.locationName} · H:{Math.round(weather.highC)}° L:{Math.round(weather.lowC)}°
                </span>
              </div>
            </div>
          </div>
        ) : (
          isOwner &&
          !hasLocation && (
            <Link href="/app/settings" className="text-xs font-semibold text-accent self-center whitespace-nowrap">
              Set your farm&apos;s location for local weather →
            </Link>
          )
        )}
      </div>

      <div className="flex items-center gap-2.5 mb-6">
        <a href="/app/export-summary" className="btn">
          <Icon name="truck" className="w-4 h-4" />
          Export summary
        </a>
        {isManager && (
          <Link href="/app/pigs/new" className="btn btn-primary">
            <Icon name="plus" className="w-3.5 h-3.5" />
            Add pig
          </Link>
        )}
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isManager ? "lg:grid-cols-5" : "lg:grid-cols-4"} gap-3.5 mb-4`}>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="pig" />Total herd</div>
          <div className="v num">{pigs.length}</div>
          <div className="d">
            {readyForFinishing} ready for finishing · {breedingStockCount} breeding stock
          </div>
        </div>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="heart" />Pregnant sows</div>
          <div className="v num">{pregnant.length}</div>
          <div className="d">{pregnant.length === 0 ? "No active pregnancies" : `${pregnant.length} active ${pregnant.length === 1 ? "pregnancy" : "pregnancies"}`}</div>
        </div>
        <div className={`card stat-tile p-[17px_18px]${rationsBelowReorder > 0 ? " critical" : ""}`}>
          <div className="k"><Icon name="wheat" />Feed on hand</div>
          <div className="v num">{fmtWeight(totalFeedKg, unit, 0)}</div>
          <div className={`d${rationsBelowReorder > 0 ? " critical" : ""}`}>
            {rationsBelowReorder === 0 ? "All rations stocked" : `${rationsBelowReorder} ${rationsBelowReorder === 1 ? "ration" : "rations"} at or below reorder point`}
          </div>
        </div>
        <div className="card stat-tile p-[17px_18px]">
          <div className="k"><Icon name="calendar" />Feed runs out in</div>
          <div className="v num">{mostUrgentFeed ? `${Math.max(0, Math.round(mostUrgentFeed.daysLeft))}d` : "—"}</div>
          <div className={`d${mostUrgentFeed && mostUrgentFeed.daysLeft <= 7 ? " warn" : ""}`}>
            {mostUrgentFeed ? mostUrgentFeed.feedType : "No feeding plan tracked yet"}
          </div>
        </div>
        {isManager && (
          <div className="card stat-tile p-[17px_18px]">
            <div className="k"><Icon name="tag" />Revenue, this month</div>
            <div className="v num">{fmtMoney(revenueThisMonth, farm.currency)}</div>
            <div className="d">{salesThisMonth.length} {salesThisMonth.length === 1 ? "sale" : "sales"} this month</div>
          </div>
        )}
      </div>

      <div className={`grid grid-cols-1 ${isManager ? "lg:grid-cols-2" : ""} gap-3.5 mb-3.5 items-stretch`}>
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-ink">Needs attention</h2>
          {tasks.length > 0 && (
            <span className="text-[11.5px] text-muted">{tasks.length} {tasks.length === 1 ? "item" : "items"}</span>
          )}
        </div>
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
              <span className={`badge badge-${t.cls}`}>{t.badge}</span>
            </Link>
          ))}
        </div>
      </div>

      {isManager && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="font-semibold text-[15.5px]">Revenue vs. expenses</h3>
              <span className="text-[11.5px] text-muted flex items-center gap-1.5">
                year to date
                <span aria-hidden="true">{currencyFlag(farm.currency)}</span>
              </span>
            </div>
            <Donut
              slices={[
                { label: "Revenue", value: ytdRevenue, color: categoricalColor(0) },
                { label: "Expenses", value: allCosts, color: categoricalColor(1) },
              ]}
              centerLabel={fmtMoneyCompact(ytdRevenue - allCosts, farm.currency)}
              centerSub={ytdRevenue - allCosts >= 0 ? "profit" : "loss"}
              valueFormat={(n) => fmtMoney(n, farm.currency)}
            />
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="font-semibold text-[15.5px]">Where the money goes</h3>
              <span className="text-[11.5px] text-muted flex items-center gap-1.5">
                expenses by category, YTD
                <span aria-hidden="true">{currencyFlag(farm.currency)}</span>
              </span>
            </div>
            <Donut
              slices={expenseSlices}
              centerLabel={fmtMoneyCompact(allCosts, farm.currency)}
              centerSub="total"
              valueFormat={(n) => fmtMoney(n, farm.currency)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
