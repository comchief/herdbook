import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { subscriptionStatus } from "@/lib/subscription";
import type { SessionPayload } from "@/lib/session";

/** Loads the signed-in user's farm and sends them to the billing/paywall
 * screen if the trial has ended and no approved payment covers today.
 * Call this at the top of every operational page (not on /app/billing
 * itself, or the redirect would loop). */
export async function requireActiveFarm(session: SessionPayload) {
  const [farm] = await db.select().from(schema.farms).where(eq(schema.farms.id, session.farmId)).limit(1);
  if (!farm) redirect("/login");
  const status = subscriptionStatus(farm!);
  if (status === "expired") redirect("/app/billing");
  return farm!;
}

export async function loadFarm(session: SessionPayload) {
  const [farm] = await db.select().from(schema.farms).where(eq(schema.farms.id, session.farmId)).limit(1);
  if (!farm) redirect("/login");
  return farm!;
}

/** Lightweight lookup for server actions that need to convert a submitted
 * weight into canonical kg but don't otherwise load the farm record. */
export async function getFarmUnit(farmId: string): Promise<"kg" | "lbs"> {
  const [farm] = await db.select({ unit: schema.farms.unit }).from(schema.farms).where(eq(schema.farms.id, farmId)).limit(1);
  return farm?.unit === "lbs" ? "lbs" : "kg";
}
