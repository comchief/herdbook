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
