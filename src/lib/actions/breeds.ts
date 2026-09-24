"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

/** Same gate as updateFarmSettingsAction: any signed-in Manager/Owner can
 * manage the breed list, Workers can't (the Farm settings page itself is
 * Owner-only, but the actions guard independently since they can be
 * called directly). */
async function requireFarmSession() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role === "worker") redirect("/app/settings");
  return session;
}

function str(fd: FormData, key: string) {
  return String(fd.get(key) || "").trim();
}

function revalidateBreedPaths() {
  revalidatePath("/app/settings");
  revalidatePath("/app/pigs/new");
  revalidatePath("/app/pigs");
}

export async function addBreedAction(formData: FormData) {
  const session = await requireFarmSession();
  const name = str(formData, "name");
  if (!name) redirect("/app/settings?error=" + encodeURIComponent("Breed name is required."));

  await db
    .insert(schema.pigBreeds)
    .values({ farmId: session.farmId, name })
    .onConflictDoNothing({ target: [schema.pigBreeds.farmId, schema.pigBreeds.name] });

  revalidateBreedPaths();
  redirect("/app/settings?saved=1");
}

export async function renameBreedAction(formData: FormData) {
  const session = await requireFarmSession();
  const id = str(formData, "id");
  const name = str(formData, "name");
  if (!id || !name) redirect("/app/settings?error=" + encodeURIComponent("Breed name is required."));

  await db
    .update(schema.pigBreeds)
    .set({ name })
    .where(and(eq(schema.pigBreeds.farmId, session.farmId), eq(schema.pigBreeds.id, id)));

  revalidateBreedPaths();
  redirect("/app/settings?saved=1");
}

export async function deleteBreedAction(formData: FormData) {
  const session = await requireFarmSession();
  const id = str(formData, "id");
  if (!id) redirect("/app/settings");

  await db.delete(schema.pigBreeds).where(and(eq(schema.pigBreeds.farmId, session.farmId), eq(schema.pigBreeds.id, id)));

  revalidateBreedPaths();
  redirect("/app/settings?saved=1");
}
