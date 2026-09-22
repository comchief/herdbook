"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { getFarmUnit } from "@/lib/gate";
import { displayToKg } from "@/lib/units";

function str(fd: FormData, key: string) {
  return String(fd.get(key) || "").trim();
}
function num(fd: FormData, key: string): number | null {
  const v = fd.get(key);
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Any signed-in role may record a mating date — this is one of the few
 * writes a Worker account is explicitly allowed to make. */
export async function createBreedingAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");

  const sowTag = str(formData, "sowTag");
  const boarTag = str(formData, "boarTag") || null;
  const matingDate = str(formData, "matingDate");
  const expectedFarrowDate = str(formData, "expectedFarrowDate");
  if (!sowTag || !matingDate || !expectedFarrowDate) {
    redirect("/app/breeding?error=" + encodeURIComponent("Sow, mating date and expected farrow date are required."));
  }

  const [sow] = await db
    .select()
    .from(schema.pigs)
    .where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.tag, sowTag)))
    .limit(1);
  const [boar] = boarTag
    ? await db
        .select()
        .from(schema.pigs)
        .where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.tag, boarTag)))
        .limit(1)
    : [null];

  await db.insert(schema.breedingRecords).values({
    farmId: session.farmId,
    sowTag,
    sowName: sow?.name ?? sowTag,
    boarTag,
    boarName: boar?.name ?? boarTag,
    matingDate: new Date(matingDate),
    expectedFarrowDate: new Date(expectedFarrowDate),
    status: "confirmed-pregnant",
    notes: str(formData, "notes") || null,
  });

  if (sow) {
    await db
      .update(schema.pigs)
      .set({ status: "breeding-sow" })
      .where(eq(schema.pigs.id, sow.id));
  }

  revalidatePath("/app/breeding");
  revalidatePath("/app");
  redirect("/app/breeding");
}

/** Logging the farrowing outcome (and the herd-size/weight impact it has)
 * is a manager/owner action. */
export async function logFarrowOutcomeAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role === "worker") redirect("/app/breeding");

  const breedingId = str(formData, "breedingId");
  const actualFarrowDate = str(formData, "actualFarrowDate");
  const litterSize = num(formData, "litterSize");
  const pigletsWeaned = num(formData, "pigletsWeaned");
  const litterWeightInput = num(formData, "totalLitterWeightKg");
  const unit = await getFarmUnit(session.farmId);
  const totalLitterWeightKg = litterWeightInput === null ? null : displayToKg(litterWeightInput, unit);

  const [record] = await db
    .select()
    .from(schema.breedingRecords)
    .where(and(eq(schema.breedingRecords.farmId, session.farmId), eq(schema.breedingRecords.id, breedingId)))
    .limit(1);
  if (!record) redirect("/app/breeding");

  await db
    .update(schema.breedingRecords)
    .set({
      actualFarrowDate: actualFarrowDate ? new Date(actualFarrowDate) : new Date(),
      litterSize,
      pigletsWeaned,
      totalLitterWeightKg,
      status: "farrowed",
    })
    .where(eq(schema.breedingRecords.id, breedingId));

  revalidatePath("/app/breeding");
  revalidatePath("/app");
  redirect("/app/breeding");
}

export async function deleteBreedingAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role === "worker") redirect("/app/breeding");
  const id = str(formData, "id");
  await db.delete(schema.breedingRecords).where(and(eq(schema.breedingRecords.farmId, session.farmId), eq(schema.breedingRecords.id, id)));
  revalidatePath("/app/breeding");
  redirect("/app/breeding");
}
