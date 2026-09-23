"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { getFarmUnit } from "@/lib/gate";
import { displayToKg } from "@/lib/units";

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
 * weight trend chart, and — for acquired-only pigs — to track growth off
 * the acquisition weight; see src/lib/growth.ts), keeping only the most
 * recent 36 entries. Dated `today` unless `dateOverride` is given: creating
 * an acquired-only pig (acquiredDate, no dob) dates its first entry at the
 * acquired date instead, so it reads as "weight as of acquisition" rather
 * than "weight as of whenever this got entered into the system". */
function appendWeightLog(existing: unknown, weightKg: number | null, dateOverride?: string): WeightLogEntry[] {
  const log: WeightLogEntry[] = Array.isArray(existing) ? (existing as WeightLogEntry[]) : [];
  if (weightKg === null || weightKg <= 0) return log;
  const today = new Date().toISOString().slice(0, 10);
  const date = dateOverride && dateOverride <= today ? dateOverride : today;
  const last = log[log.length - 1];
  const next = last && last.date === date ? [...log.slice(0, -1), { date, weightKg }] : [...log, { date, weightKg }];
  return next.slice(-36);
}

export async function createPigAction(formData: FormData) {
  const session = await requireManagerSession();
  const tag = str(formData, "tag");
  const name = str(formData, "name");
  const dob = dateOrNull(formData, "dob");
  const acquiredDate = dateOrNull(formData, "acquiredDate");
  if (!tag || !name) redirect("/app/pigs?error=" + encodeURIComponent("Ear tag and name are required."));
  if (!dob && !acquiredDate) {
    redirect("/app/pigs?error=" + encodeURIComponent("Provide a date of birth, or an acquired date if the birth date is unknown."));
  }

  const [clash] = await db
    .select()
    .from(schema.pigs)
    .where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.tag, tag)))
    .limit(1);
  if (clash) redirect("/app/pigs?error=" + encodeURIComponent("That ear tag is already in use."));

  const unit = await getFarmUnit(session.farmId);
  const weightInput = num(formData, "weight");
  const targetWeightInput = num(formData, "targetWeightKg");
  const weight = weightInput === null ? null : displayToKg(weightInput, unit);
  const targetWeightKg = targetWeightInput === null ? null : displayToKg(targetWeightInput, unit);

  // With no date of birth, the pig's age can't be known — only how long
  // it's been on the farm. A weight at acquisition is required so growth
  // can still be tracked, off that weight, instead of off a guessed age
  // (see src/lib/growth.ts).
  const acquiredOnly = !dob && !!acquiredDate;
  if (acquiredOnly && (weight === null || weight <= 0)) {
    redirect(
      "/app/pigs?error=" +
        encodeURIComponent("A starting weight is required when using an acquired date instead of a date of birth — it's used to track growth from here.")
    );
  }

  await db.insert(schema.pigs).values({
    farmId: session.farmId,
    tag,
    name,
    breed: str(formData, "breed") || null,
    sexBase: str(formData, "sexBase") || "Female",
    dob: dob,
    status: str(formData, "status") || "piglet",
    pen: str(formData, "pen") || null,
    currentWeightKg: weight ?? 0,
    sireTag: str(formData, "sireTag") || null,
    damTag: str(formData, "damTag") || null,
    targetWeightKg,
    targetMonths: num(formData, "targetMonths"),
    notes: str(formData, "notes") || null,
    acquiredDate: acquiredDate,
    weightLog: appendWeightLog([], weight, acquiredOnly ? acquiredDate!.toISOString().slice(0, 10) : undefined),
  });

  revalidatePath("/app/pigs");
  redirect("/app/pigs");
}

export async function updatePigAction(formData: FormData) {
  const session = await requireManagerSession();
  const originalTag = str(formData, "originalTag");
  const newTag = str(formData, "tag") || originalTag;
  const dob = dateOrNull(formData, "dob");
  const acquiredDate = dateOrNull(formData, "acquiredDate");
  if (!originalTag || !newTag) redirect("/app/pigs?error=" + encodeURIComponent("Ear tag is required."));
  if (!dob && !acquiredDate) {
    redirect("/app/pigs?error=" + encodeURIComponent("Provide a date of birth, or an acquired date if the birth date is unknown."));
  }

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

  const unit = await getFarmUnit(session.farmId);
  const newWeightInput = num(formData, "weight");
  const newTargetWeightInput = num(formData, "targetWeightKg");
  const newWeight = newWeightInput === null ? null : displayToKg(newWeightInput, unit);
  const newTargetWeightKg = newTargetWeightInput === null ? null : displayToKg(newTargetWeightInput, unit);
  const weightChanged = newWeight !== null && newWeight !== pig!.currentWeightKg;

  // Same requirement as adding a pig: with no dob, growth is tracked off
  // the weight on file rather than a guessed age, so it can't be blank.
  const acquiredOnly = !dob && !!acquiredDate;
  const effectiveWeight = newWeight ?? pig!.currentWeightKg;
  if (acquiredOnly && effectiveWeight <= 0) {
    redirect(
      "/app/pigs?error=" +
        encodeURIComponent("A starting weight is required when using an acquired date instead of a date of birth — it's used to track growth from here.")
    );
  }

  await db
    .update(schema.pigs)
    .set({
      tag: newTag,
      name: str(formData, "name") || pig!.name,
      breed: str(formData, "breed") || null,
      sexBase: str(formData, "sexBase") || pig!.sexBase,
      dob: dob,
      acquiredDate: acquiredDate,
      status: str(formData, "status") || pig!.status,
      pen: str(formData, "pen") || null,
      currentWeightKg: newWeight ?? pig!.currentWeightKg,
      sireTag: str(formData, "sireTag") || null,
      damTag: str(formData, "damTag") || null,
      targetWeightKg: newTargetWeightKg,
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

/** One-click accept for the "grown into a new stage" alert on the pig
 * profile page and dashboard — just updates the recorded status to match
 * the stage its age already puts it in (see growthStatus's stageMismatch
 * in src/lib/growth.ts). Never runs automatically; the person has to
 * click it. */
export async function syncPigStageAction(formData: FormData) {
  const session = await requireManagerSession();
  const tag = str(formData, "tag");
  const newStage = str(formData, "newStage");
  if (!tag || !["piglet", "weaner", "grower", "finisher"].includes(newStage)) redirect("/app/pigs");

  await db
    .update(schema.pigs)
    .set({ status: newStage, updatedAt: new Date() })
    .where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.tag, tag)));

  revalidatePath("/app/pigs");
  revalidatePath(`/app/pigs/${tag}`);
  revalidatePath("/app");
  redirect(`/app/pigs/${encodeURIComponent(tag)}?stageSynced=1`);
}

export async function deletePigAction(formData: FormData) {
  const session = await requireManagerSession();
  const tag = str(formData, "tag");
  if (!tag) redirect("/app/pigs");
  await db.delete(schema.pigs).where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.tag, tag)));
  revalidatePath("/app/pigs");
  redirect("/app/pigs");
}
