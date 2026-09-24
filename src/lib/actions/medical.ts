"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

function str(fd: FormData, key: string) {
  return String(fd.get(key) || "").trim();
}
function num(fd: FormData, key: string): number {
  const n = Number(fd.get(key));
  return Number.isFinite(n) ? n : 0;
}

/** Logging an injury/treatment is one of the actions a Worker account is
 * explicitly allowed to take. */
export async function createMedicalAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");

  const pigTag = str(formData, "pigTag");
  const date = str(formData, "date");
  const description = str(formData, "description");
  const type = str(formData, "type") || "treatment";
  const medicationName = str(formData, "medicationName");
  if (!pigTag || !date || !description) {
    redirect("/app/medical?error=" + encodeURIComponent("Pig, date and description are required."));
  }
  if (type === "medication" && !medicationName) {
    redirect("/app/medical?error=" + encodeURIComponent("Select which medication was administered."));
  }

  const [pig] = await db
    .select()
    .from(schema.pigs)
    .where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.tag, pigTag)))
    .limit(1);

  const nextDueDate = str(formData, "nextDueDate");

  await db.insert(schema.medicalRecords).values({
    farmId: session.farmId,
    pigTag,
    pigName: pig?.name ?? pigTag,
    date: new Date(date),
    type,
    description,
    medicationName: type === "medication" ? medicationName : null,
    administeredBy: str(formData, "administeredBy") || null,
    cost: num(formData, "cost"),
    nextDueDate: nextDueDate ? new Date(nextDueDate) : null,
  });

  revalidatePath("/app/medical");
  revalidatePath("/app");
  redirect("/app/medical");
}

/** Clears a follow-up's due date — available to any role, same as logging
 * the record in the first place. */
export async function dismissFollowupAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");
  const id = str(formData, "id");
  await db
    .update(schema.medicalRecords)
    .set({ nextDueDate: null })
    .where(and(eq(schema.medicalRecords.farmId, session.farmId), eq(schema.medicalRecords.id, id)));
  revalidatePath("/app/medical");
  revalidatePath("/app");
  redirect("/app/medical");
}

export async function deleteMedicalAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role === "worker") redirect("/app/medical");
  const id = str(formData, "id");
  await db.delete(schema.medicalRecords).where(and(eq(schema.medicalRecords.farmId, session.farmId), eq(schema.medicalRecords.id, id)));
  revalidatePath("/app/medical");
  redirect("/app/medical");
}
