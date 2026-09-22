import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/** How many "needs attention" items a farm currently has — pregnancies due
 * within 30 days, medical follow-ups due within 14 days, and feed below its
 * reorder point. Mirrors the dashboard's own task list thresholds; used by
 * the topbar's notification bell so it doesn't need the full record sets. */
export async function needsAttentionCount(farmId: string): Promise<number> {
  const [breeding, medical, feed] = await Promise.all([
    db.select().from(schema.breedingRecords).where(eq(schema.breedingRecords.farmId, farmId)),
    db.select().from(schema.medicalRecords).where(eq(schema.medicalRecords.farmId, farmId)),
    db.select().from(schema.feedInventory).where(eq(schema.feedInventory.farmId, farmId)),
  ]);
  const now = Date.now();
  let count = 0;
  for (const b of breeding) {
    if (b.actualFarrowDate) continue;
    if ((b.expectedFarrowDate.getTime() - now) / 86400000 <= 30) count++;
  }
  for (const m of medical) {
    if (!m.nextDueDate) continue;
    if ((m.nextDueDate.getTime() - now) / 86400000 <= 14) count++;
  }
  for (const f of feed) {
    if (f.stockKg < f.reorderLevelKg) count++;
  }
  return count;
}
