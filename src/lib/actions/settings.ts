"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { geocodeLocation } from "@/lib/weather";

export async function updateFarmSettingsAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role === "worker") redirect("/app/settings");

  const name = String(formData.get("farmName") || "").trim();
  const currency = String(formData.get("currency") || "USD");
  const unit = String(formData.get("unit") || "kg");
  const locationInput = String(formData.get("location") || "").trim();
  if (!name) redirect("/app/settings?error=" + encodeURIComponent("Farm name is required."));

  const [farm] = await db.select().from(schema.farms).where(eq(schema.farms.id, session.farmId)).limit(1);
  if (!farm) redirect("/login");

  // Only re-geocode when the location text actually changed — it's an
  // external lookup, no reason to repeat it on every settings save.
  let locationName = farm!.locationName;
  let latitude = farm!.latitude;
  let longitude = farm!.longitude;
  let timezone = farm!.timezone;
  if (locationInput !== (farm!.locationName ?? "")) {
    if (!locationInput) {
      locationName = null;
      latitude = null;
      longitude = null;
      timezone = null;
    } else {
      const geocoded = await geocodeLocation(locationInput);
      if (!geocoded) {
        redirect(
          "/app/settings?error=" +
            encodeURIComponent(`Couldn't find "${locationInput}" — try a nearby city and country, e.g. "Kingston, Jamaica".`)
        );
      }
      locationName = geocoded!.name;
      latitude = geocoded!.latitude;
      longitude = geocoded!.longitude;
      timezone = geocoded!.timezone;
    }
  }

  await db
    .update(schema.farms)
    .set({ name, currency, unit, locationName, latitude, longitude, timezone })
    .where(eq(schema.farms.id, session.farmId));
  revalidatePath("/app", "layout");
  redirect("/app/settings?saved=1");
}
