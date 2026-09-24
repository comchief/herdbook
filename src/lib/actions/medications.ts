"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

async function requireFarmSession() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role === "worker") redirect("/app/settings");
  return session;
}

function str(fd: FormData, key: string) {
  return String(fd.get(key) || "").trim();
}

function revalidateMedicationPaths() {
  revalidatePath("/app/settings");
  revalidatePath("/app/medical");
}

export async function addMedicationAction(formData: FormData) {
  const session = await requireFarmSession();
  const name = str(formData, "name");
  const use = str(formData, "use");
  if (!name) redirect("/app/settings?error=" + encodeURIComponent("Medication name is required."));

  await db
    .insert(schema.medications)
    .values({ farmId: session.farmId, name, use: use || null })
    .onConflictDoNothing({ target: [schema.medications.farmId, schema.medications.name] });

  revalidateMedicationPaths();
  redirect("/app/settings?saved=1");
}

export async function updateMedicationAction(formData: FormData) {
  const session = await requireFarmSession();
  const id = str(formData, "id");
  const name = str(formData, "name");
  const use = str(formData, "use");
  if (!id || !name) redirect("/app/settings?error=" + encodeURIComponent("Medication name is required."));

  await db
    .update(schema.medications)
    .set({ name, use: use || null })
    .where(and(eq(schema.medications.farmId, session.farmId), eq(schema.medications.id, id)));

  revalidateMedicationPaths();
  redirect("/app/settings?saved=1");
}

export async function deleteMedicationAction(formData: FormData) {
  const session = await requireFarmSession();
  const id = str(formData, "id");
  if (!id) redirect("/app/settings");

  await db.delete(schema.medications).where(and(eq(schema.medications.farmId, session.farmId), eq(schema.medications.id, id)));

  revalidateMedicationPaths();
  redirect("/app/settings?saved=1");
}
