"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { getFarmUnit } from "@/lib/gate";
import { displayToKg } from "@/lib/units";
import { logActivity } from "@/lib/activity";
import { fmtDate } from "@/lib/format";
import { GESTATION_DAYS, addDays } from "@/lib/gestation";
import { lineageWarning } from "@/lib/lineage";

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
 * writes a Worker account is explicitly allowed to make. The expected
 * farrow date is always computed as matingDate + 114 days (GESTATION_DAYS)
 * rather than entered by hand. If the sow and boar share an immediate
 * ancestor (see src/lib/lineage.ts), the mating is still saved — this is a
 * soft warning, not a block — but the farmer is sent back with a banner
 * naming the relationship. */
export async function createBreedingAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");

  const sowTag = str(formData, "sowTag");
  const boarTag = str(formData, "boarTag") || null;
  const matingDateInput = str(formData, "matingDate");
  if (!sowTag || !matingDateInput) {
    redirect("/app/breeding?error=" + encodeURIComponent("Sow and mating date are required."));
  }

  const matingDate = new Date(matingDateInput);
  const expectedFarrowDate = addDays(matingDate, GESTATION_DAYS);

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
    matingDate,
    expectedFarrowDate,
    status: "confirmed-pregnant",
    notes: str(formData, "notes") || null,
  });

  if (sow) {
    await db
      .update(schema.pigs)
      .set({ status: "breeding-sow" })
      .where(eq(schema.pigs.id, sow.id));
  }

  await logActivity(
    session,
    "Recorded mating",
    `${sow?.name ?? sowTag} (${sowTag})${boarTag ? ` × ${boar?.name ?? boarTag} (${boarTag})` : ""} — expected farrow ${fmtDate(expectedFarrowDate)}`,
    sow ? `/app/pigs/${encodeURIComponent(sowTag)}` : "/app/breeding"
  );

  revalidatePath("/app/breeding");
  revalidatePath("/app");
  if (sow) revalidatePath(`/app/pigs/${sowTag}`);

  const warning = sow && boar ? lineageWarning(sow, boar) : null;
  redirect(`/app/breeding${warning ? "?warning=" + encodeURIComponent(warning) : ""}`);
}

/** Day-21 "did she come back into heat" check on the Gestation milestones
 * card. Any signed-in role may confirm it — it's a routine daily-check
 * observation, same as recording the mating itself. Confirming "returned
 * to heat" cancels the cycle (status -> "returned-to-heat") but the record
 * is kept, per the user's request, as a log of the mating attempt. */
export async function confirmPregnancyCheckAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");

  const breedingId = str(formData, "breedingId");
  const result = str(formData, "result"); // "pregnant" | "returned-to-heat"
  const [record] = await db
    .select()
    .from(schema.breedingRecords)
    .where(and(eq(schema.breedingRecords.farmId, session.farmId), eq(schema.breedingRecords.id, breedingId)))
    .limit(1);
  if (!record) redirect("/app/breeding");

  const returnedToHeat = result === "returned-to-heat";
  await db
    .update(schema.breedingRecords)
    .set({
      pregnancyCheckDone: true,
      pregnancyCheckDate: new Date(),
      returnedToHeat,
      status: returnedToHeat ? "returned-to-heat" : record.status,
    })
    .where(eq(schema.breedingRecords.id, breedingId));

  await logActivity(
    session,
    "Day-21 pregnancy check",
    `${record.sowName ?? record.sowTag} (${record.sowTag}) — ${returnedToHeat ? "returned to heat, cycle cancelled" : "still pregnant"}`,
    `/app/pigs/${encodeURIComponent(record.sowTag)}`
  );

  revalidatePath("/app/breeding");
  revalidatePath(`/app/pigs/${record.sowTag}`);
  revalidatePath("/app");
  redirect(`/app/pigs/${encodeURIComponent(record.sowTag)}`);
}

/** One-click "mark done" for the day-90 (move to farrowing pen) and
 * day-110 (begin farrowing prep) milestones — passive reminders that clear
 * once acknowledged, same one-click pattern as syncPigStageAction. */
export async function markGestationMilestoneAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");

  const breedingId = str(formData, "breedingId");
  const milestone = str(formData, "milestone"); // "pen" | "prep"
  const [record] = await db
    .select()
    .from(schema.breedingRecords)
    .where(and(eq(schema.breedingRecords.farmId, session.farmId), eq(schema.breedingRecords.id, breedingId)))
    .limit(1);
  if (!record) redirect("/app/breeding");
  if (!["pen", "prep"].includes(milestone)) redirect(`/app/pigs/${encodeURIComponent(record.sowTag)}`);

  const now = new Date();
  await db
    .update(schema.breedingRecords)
    .set(
      milestone === "pen"
        ? { movedToFarrowingPen: true, movedToFarrowingPenDate: now }
        : { farrowingPrepStarted: true, farrowingPrepStartedDate: now }
    )
    .where(eq(schema.breedingRecords.id, breedingId));

  await logActivity(
    session,
    milestone === "pen" ? "Moved sow to farrowing pen" : "Started farrowing prep",
    `${record.sowName ?? record.sowTag} (${record.sowTag})`,
    `/app/pigs/${encodeURIComponent(record.sowTag)}`
  );

  revalidatePath("/app/breeding");
  revalidatePath(`/app/pigs/${record.sowTag}`);
  revalidatePath("/app");
  redirect(`/app/pigs/${encodeURIComponent(record.sowTag)}`);
}

/** Logging the farrowing outcome (and the herd-size/weight impact it has)
 * is a manager/owner action. Confirming farrowing here only records the
 * aggregate numbers (litter size, weaned, total weight) — the individual
 * piglet pig records are created afterward on a separate "Record litter"
 * page (recordLitterAction below), reached once litterSize > 0. Editable
 * again (via the same "Edit outcome" popover) up until the litter is
 * actually recorded, so a farmer can correct the count first. */
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

  // Litter number is the sow's Nth farrowed litter — assigned once, the
  // first time an outcome is saved for this record, never recomputed on a
  // later edit (which would silently renumber it as siblings get logged).
  let litterNumber = record.litterNumber;
  if (litterNumber === null) {
    const priorLitters = await db
      .select()
      .from(schema.breedingRecords)
      .where(
        and(
          eq(schema.breedingRecords.farmId, session.farmId),
          eq(schema.breedingRecords.sowTag, record.sowTag),
          eq(schema.breedingRecords.status, "farrowed")
        )
      );
    litterNumber = priorLitters.length + 1;
  }

  await db
    .update(schema.breedingRecords)
    .set({
      actualFarrowDate: actualFarrowDate ? new Date(actualFarrowDate) : new Date(),
      litterSize,
      pigletsWeaned,
      totalLitterWeightKg,
      status: "farrowed",
      litterNumber,
    })
    .where(eq(schema.breedingRecords.id, breedingId));

  await logActivity(
    session,
    "Logged farrowing outcome",
    `${record.sowName ?? record.sowTag} (${record.sowTag}) — litter #${litterNumber}${litterSize !== null ? `, ${litterSize} born` : ""}`,
    `/app/pigs/${encodeURIComponent(record.sowTag)}`
  );

  revalidatePath("/app/breeding");
  revalidatePath(`/app/pigs/${record.sowTag}`);
  revalidatePath("/app");
  redirect("/app/breeding");
}

/** Step 2 of the litter workflow: creates one pig record per piglet from
 * the farrowing outcome logged above, each linked to the sow (damTag) and
 * boar (sireTag), dated to the actual farrow date, and tagged with
 * breedingRecordId so littermates can be found later. Manager/owner only,
 * like the outcome step it follows. */
export async function recordLitterAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role === "worker") redirect("/app/breeding");

  const breedingId = str(formData, "breedingId");
  const [record] = await db
    .select()
    .from(schema.breedingRecords)
    .where(and(eq(schema.breedingRecords.farmId, session.farmId), eq(schema.breedingRecords.id, breedingId)))
    .limit(1);
  if (!record) redirect("/app/breeding");
  if (!record.actualFarrowDate || !record.litterSize || record.litterSize <= 0 || record.litterRecorded) {
    redirect("/app/breeding");
  }

  const [sow] = await db
    .select()
    .from(schema.pigs)
    .where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.tag, record.sowTag)))
    .limit(1);

  const unit = await getFarmUnit(session.farmId);
  const litterSize = record.litterSize!;
  const litterPage = `/app/breeding/${encodeURIComponent(breedingId)}/litter`;

  type Row = { tag: string; name: string; sexBase: string; weightKg: number };
  const rows: Row[] = [];
  const seenTags = new Set<string>();
  for (let i = 0; i < litterSize; i++) {
    const tag = str(formData, `piglet_${i}_tag`);
    const name = str(formData, `piglet_${i}_name`) || `Piglet ${i + 1}`;
    const sexBase = str(formData, `piglet_${i}_sex`);
    const weightInput = num(formData, `piglet_${i}_weight`);
    if (!tag || !sexBase || !["Male", "Female"].includes(sexBase) || weightInput === null || weightInput <= 0) {
      redirect(litterPage + "?error=" + encodeURIComponent(`Piglet ${i + 1} needs a tag, sex and a weight greater than 0.`));
    }
    if (seenTags.has(tag)) {
      redirect(litterPage + "?error=" + encodeURIComponent(`Tag "${tag}" is used more than once in this litter.`));
    }
    seenTags.add(tag);
    rows.push({ tag, name, sexBase, weightKg: displayToKg(weightInput!, unit) });
  }

  // Check every tag against the farm's existing pigs in one query rather
  // than one clash-check per row.
  const existingTags = new Set((await db.select({ tag: schema.pigs.tag }).from(schema.pigs).where(eq(schema.pigs.farmId, session.farmId))).map((p) => p.tag));
  for (const row of rows) {
    if (existingTags.has(row.tag)) {
      redirect(litterPage + "?error=" + encodeURIComponent(`Ear tag "${row.tag}" is already in use.`));
    }
  }

  const farrowDateStr = record.actualFarrowDate.toISOString().slice(0, 10);
  for (const row of rows) {
    await db.insert(schema.pigs).values({
      farmId: session.farmId,
      tag: row.tag,
      name: row.name,
      sexBase: row.sexBase,
      dob: record.actualFarrowDate,
      status: "piglet",
      pen: sow?.pen ?? null,
      currentWeightKg: row.weightKg,
      sireTag: record.boarTag,
      damTag: record.sowTag,
      breedingRecordId: record.id,
      weightLog: [{ date: farrowDateStr, weightKg: row.weightKg }],
    });
  }

  await db.update(schema.breedingRecords).set({ litterRecorded: true }).where(eq(schema.breedingRecords.id, breedingId));

  await logActivity(
    session,
    "Recorded litter",
    `${record.sowName ?? record.sowTag} (${record.sowTag}) — litter #${record.litterNumber ?? "?"}, ${rows.length} piglets`,
    "/app/pigs"
  );

  revalidatePath("/app/breeding");
  revalidatePath("/app/pigs");
  revalidatePath(`/app/pigs/${record.sowTag}`);
  revalidatePath("/app");
  redirect("/app/breeding?litterRecorded=" + rows.length);
}

export async function deleteBreedingAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role === "worker") redirect("/app/breeding");
  const id = str(formData, "id");
  const [record] = await db
    .select()
    .from(schema.breedingRecords)
    .where(and(eq(schema.breedingRecords.farmId, session.farmId), eq(schema.breedingRecords.id, id)))
    .limit(1);
  await db.delete(schema.breedingRecords).where(and(eq(schema.breedingRecords.farmId, session.farmId), eq(schema.breedingRecords.id, id)));
  if (record) {
    await logActivity(session, "Deleted breeding record", `${record.sowName ?? record.sowTag} (${record.sowTag})`, "/app/breeding");
  }
  revalidatePath("/app/breeding");
  redirect("/app/breeding");
}
