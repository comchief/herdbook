import { requireSession } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { fmtWeight, weightUnitLabel } from "@/lib/units";
import { fmtDate } from "@/lib/format";
import { fmtMoney } from "@/lib/currency";
import { getGrowthStageRules } from "@/lib/growth-rules-db";

/** Quotes a CSV field only when it needs it (contains a comma, quote, or
 * newline), doubling any embedded quotes per RFC 4180. */
function csvField(value: string | number) {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function csvRow(fields: (string | number)[]) {
  return fields.map(csvField).join(",");
}

/** Downloads a one-page CSV snapshot of the dashboard's headline numbers —
 * the same figures shown in the stat tiles, so the export always matches
 * what the person was just looking at. */
export async function GET() {
  const session = await requireSession();
  const farm = await requireActiveFarm(session);
  const isManager = session.role !== "worker";
  const farmId = session.farmId;
  const unit = farm.unit === "lbs" ? "lbs" : "kg";

  const [pigs, breeding, feedInventory, sales, growthRules] = await Promise.all([
    db.select().from(schema.pigs).where(eq(schema.pigs.farmId, farmId)),
    db.select().from(schema.breedingRecords).where(eq(schema.breedingRecords.farmId, farmId)),
    db.select().from(schema.feedInventory).where(eq(schema.feedInventory.farmId, farmId)),
    db.select().from(schema.sales).where(eq(schema.sales.farmId, farmId)),
    getGrowthStageRules(),
  ]);

  const pregnant = breeding.filter((b) => !b.actualFarrowDate);
  const totalFeedKg = feedInventory.reduce((s, f) => s + f.stockKg, 0);
  const breedingStockCount = pigs.filter((p) => p.status === "breeding-sow" || p.status === "breeding-boar").length;
  const readyForFinishing = pigs.filter(
    (p) => ["grower", "finisher"].includes(p.status) && p.currentWeightKg >= growthRules.finisher.endWeightMinKg
  ).length;
  const rationsBelowReorder = feedInventory.filter((f) => f.stockKg < f.reorderLevelKg).length;

  const today = new Date();
  const ym = today.toISOString().slice(0, 7);
  const salesThisMonth = sales.filter((s) => s.date.toISOString().slice(0, 7) === ym);
  const revenueThisMonth = salesThisMonth.reduce((s, sale) => s + sale.revenue, 0);

  const rows: (string | number)[][] = [
    [`Herdbook summary — ${farm.name}`],
    ["Generated", fmtDate(today)],
    [],
    ["Metric", "Value"],
    ["Total herd", pigs.length],
    ["Ready for finishing", readyForFinishing],
    ["Breeding stock", breedingStockCount],
    ["Pregnant sows", pregnant.length],
    [`Feed on hand (${weightUnitLabel(unit)})`, fmtWeight(totalFeedKg, unit, 0)],
    ["Rations below reorder point", rationsBelowReorder],
  ];
  if (isManager) {
    rows.push(["Revenue this month", fmtMoney(revenueThisMonth, farm.currency)]);
    rows.push(["Sales this month", salesThisMonth.length]);
  }

  const csv = rows.map(csvRow).join("\r\n");
  const filename = `herdbook-summary-${today.toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
