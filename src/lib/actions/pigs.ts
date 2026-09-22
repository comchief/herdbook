"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

async function requireManagerSession() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role === "worker") redirect("/app/pigs");
  return session;
}

function str(fd: FormData, key: string) {
  return String(fd.get(key) || "").trim();
}
function num(fd: FormData, key: string): number | null {
  const v = fd.get(key);
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function dateOrNull(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  return v ? new Date(v) : null;
}

type WeightLogEntry = { date: string; weightKg: number };

/** Appends a weigh-in to a pig's history (used to drive the dashboard's herd
 * weight trend chart), keeping only the most recent 36 entries. */
function appendWeightLog(existing: unknown, weightKg: number | null): WeightLogEntry[] {
  const log: WeightLogEntry[] = Array.isArray(existing) ? (existing as WeightLogEntry[]) : [];
  if (weightKg === null || weightKg <= 0) return log;
  const today = new Date().toISOString().slice(0, 10);
  const last = log[log.length - 1];
  const next = last && last.date === today ? [...log.slice(0, -1), { date: today, weightKg }] : [...log, { date: today, weightKg }];
  return next.slice(-36);
}

export async function createPigAction(formData: FormData) {
  const session = await requireManagerSession();
  const tag = str(formData, "tag");
  const name = str(formData, "name");
  const dob = dateOrNull(formData, "dob");
  if (!tag || !name || !dob) redirect("/app/pigs?error=" + encodeURIComponent("Ear tag, name and date of birth are required."));

  const [clash] = await db
    .select()
    .from(schema.pigs)
    .where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.tag, tag)))
    .limit(1);
  if (clash) redirect("/app/pigs?error=" + encodeURIComponent("That ear tag is already in use."));

  const weight = num(formData, "weight");
  await db.insert(schema.pigs).values({
    farmId: session.farmId,
    tag,
    name,
    breed: str(formData, "breed") || null,
    sexBase: str(formData, "sexBase") || "Female",
    dob: dob!,
    status: str(formData, "status") || "piglet",
    pen: str(formData, "pen") || null,
    currentWeightKg: weight ?? 0,
    sireTag: str(formData, "sireTag") || null,
    damTag: str(formData, "damTag") || null,
    targetWeightKg: num(formData, "targetWeightKg"),
    targetMonths: num(formData, "targetMonths"),
    notes: str(formData, "notes") || null,
    acquiredDate: new Date(),
    weightLog: appendWeightLog([], weight),
  });

  revalidatePath("/app/pigs");
  redirect("/app/pigs");
}

export async function updatePigAction(formData: FormData) {
  const session = await requireManagerSession();
  const originalTag = str(formData, "originalTag");
  const newTag = str(formData, "tag") || originalTag;
  const dob = dateOrNull(formData, "dob");
  if (!originalTag || !newTag || !dob) redirect("/app/pigs?error=" + encodeURIComponent("Ear tag and date of birth are required."));

  const [pig] = await db
    .select()
    .from(schema.pigs)
    .where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.tag, originalTag)))
    .limit(1);
  if (!pig) redirect("/app/pigs?error=" + encodeURIComponent("Couldn't find that pig."));

  if (newTag !== originalTag) {
    const [clash] = await db
      .select()
      .from(schema.pigs)
      .where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.tag, newTag)))
      .limit(1);
    if (clash) redirect("/app/pigs?error=" + encodeURIComponent("That ear tag is already in use."));
  }

  const newWeight = num(formData, "weight");
  const weightChanged = newWeight !== null && newWeight !== pig!.currentWeightKg;
  await db
    .update(schema.pigs)
    .set({
      tag: newTag,
      name: str(formData, "name") || pig!.name,
      breed: str(formData, "breed") || null,
      sexBase: str(formData, "sexBase") || pig!.sexBase,
      dob: dob!,
      status: str(formData, "status") || pig!.status,
      pen: str(formData, "pen") || null,
      currentWeightKg: newWeight ?? pig!.currentWeightKg,
      sireTag: str(formData, "sireTag") || null,
      damTag: str(formData, "damTag") || null,
      targetWeightKg: num(formData, "targetWeightKg"),
      targetMonths: num(formData, "targetMonths"),
      notes: str(formData, "notes") || null,
      updatedAt: new Date(),
      ...(weightChanged ? { weightLog: appendWeightLog(pig!.weightLog, newWeight) } : {}),
    })
    .where(eq(schema.pigs.id, pig!.id));

  // Ear-tag rename: cascade the new tag to every record that referenced the old one.
  if (newTag !== originalTag) {
    const farmId = session.farmId;
    await db
      .update(schema.pigs)
      .set({ sireTag: newTag })
      .where(and(eq(schema.pigs.farmId, farmId), eq(schema.pigs.sireTag, originalTag)));
    await db
      .update(schema.pigs)
      .set({ damTag: newTag })
      .where(and(eq(schema.pigs.farmId, farmId), eq(schema.pigs.damTag, originalTag)));
    await db
      .update(schema.medicalRecords)
      .set({ pigTag: newTag })
      .where(and(eq(schema.medicalRecords.farmId, farmId), eq(schema.medicalRecords.pigTag, originalTag)));
    await db
      .update(schema.breedingRecords)
      .set({ sowTag: newTag })
      .where(and(eq(schema.breedingRecords.farmId, farmId), eq(schema.breedingRecords.sowTag, originalTag)));
    await db
      .update(schema.breedingRecords)
      .set({ boarTag: newTag })
      .where(and(eq(schema.breedingRecords.farmId, farmId), eq(schema.breedingRecords.boarTag, originalTag)));
    await db
      .update(schema.sales)
      .set({ pigTag: newTag })
      .where(and(eq(schema.sales.farmId, farmId), eq(schema.sales.pigTag, originalTag)));
  }

  revalidatePath("/app/pigs");
  redirect("/app/pigs");
}

export async function deletePigAction(formData: FormData) {
  const session = await requireManagerSession();
  const tag = str(formData, "tag");
  if (!tag) redirect("/app/pigs");
  await db.delete(schema.pigs).where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.tag, tag)));
  revalidatePath("/app/pigs");
  redirect("/app/pigs");
}
