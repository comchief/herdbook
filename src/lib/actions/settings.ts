"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function updateFarmSettingsAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role === "worker") redirect("/app/settings");

  const name = String(formData.get("farmName") || "").trim();
  const currency = String(formData.get("currency") || "USD");
  const unit = String(formData.get("unit") || "kg");
  if (!name) redirect("/app/settings?error=" + encodeURIComponent("Farm name is required."));

  await db.update(schema.farms).set({ name, currency, unit }).where(eq(schema.farms.id, session.farmId));
  revalidatePath("/app", "layout");
  redirect("/app/settings?saved=1");
}
