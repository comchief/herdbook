"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { getFarmCurrency } from "@/lib/gate";
import { logActivity } from "@/lib/activity";
import { fmtMoney } from "@/lib/currency";

function str(fd: FormData, key: string) {
  return String(fd.get(key) || "").trim();
}
function num(fd: FormData, key: string): number {
  const n = Number(fd.get(key));
  return Number.isFinite(n) ? n : 0;
}

async function requireManagerSession() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role === "worker") redirect("/app");
  return session;
}

const TYPE_LABEL: Record<string, string> = {
  "owner-equity": "Owner equity",
  loan: "Loan",
  grant: "Grant",
  other: "Other",
};

/** Logs money put into the farm from outside its everyday operations —
 * same manager/owner gate as logging an expense (see requireManagerSession
 * above and createExpenseAction in src/lib/actions/expenses.ts). Never
 * touches the expenses table or the Profit/loss figure derived from it. */
export async function createCapitalContributionAction(formData: FormData) {
  const session = await requireManagerSession();
  const date = str(formData, "date");
  const source = str(formData, "source");
  const amount = num(formData, "amount");
  if (!date || !source || amount <= 0) {
    redirect("/app/expenses?error=" + encodeURIComponent("Date, source and a positive amount are required for a capital contribution."));
  }

  const type = str(formData, "type") || "owner-equity";
  await db.insert(schema.capitalContributions).values({
    farmId: session.farmId,
    date: new Date(date),
    type,
    source,
    notes: str(formData, "notes") || null,
    amount,
  });

  const currency = await getFarmCurrency(session.farmId);
  await logActivity(
    session,
    "Logged investment capital",
    `${TYPE_LABEL[type] ?? type} — ${source}, ${fmtMoney(amount, currency)}`,
    "/app/expenses"
  );

  revalidatePath("/app/expenses");
  revalidatePath("/app");
  redirect("/app/expenses");
}

export async function deleteCapitalContributionAction(formData: FormData) {
  const session = await requireManagerSession();
  const id = str(formData, "id");
  const [contribution] = await db
    .select()
    .from(schema.capitalContributions)
    .where(and(eq(schema.capitalContributions.farmId, session.farmId), eq(schema.capitalContributions.id, id)))
    .limit(1);
  await db
    .delete(schema.capitalContributions)
    .where(and(eq(schema.capitalContributions.farmId, session.farmId), eq(schema.capitalContributions.id, id)));
  if (contribution) {
    const currency = await getFarmCurrency(session.farmId);
    await logActivity(
      session,
      "Deleted a capital contribution",
      `${TYPE_LABEL[contribution.type] ?? contribution.type} — ${contribution.source}, ${fmtMoney(contribution.amount, currency)}`,
      "/app/expenses"
    );
  }
  revalidatePath("/app/expenses");
  redirect("/app/expenses");
}
