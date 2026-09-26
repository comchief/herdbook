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

export async function createExpenseAction(formData: FormData) {
  const session = await requireManagerSession();
  const date = str(formData, "date");
  const description = str(formData, "description");
  const amount = num(formData, "amount");
  if (!date || !description || amount <= 0) {
    redirect("/app/expenses?error=" + encodeURIComponent("Date, description and a positive amount are required."));
  }

  const category = str(formData, "category") || "other";
  await db.insert(schema.expenses).values({
    farmId: session.farmId,
    date: new Date(date),
    category,
    description,
    vendor: str(formData, "vendor") || null,
    amount,
  });

  const currency = await getFarmCurrency(session.farmId);
  await logActivity(session, "Logged an expense", `${category} — ${description}, ${fmtMoney(amount, currency)}`, "/app/expenses");

  revalidatePath("/app/expenses");
  revalidatePath("/app");
  redirect("/app/expenses");
}

export async function deleteExpenseAction(formData: FormData) {
  const session = await requireManagerSession();
  const id = str(formData, "id");
  const [expense] = await db.select().from(schema.expenses).where(and(eq(schema.expenses.farmId, session.farmId), eq(schema.expenses.id, id))).limit(1);
  await db.delete(schema.expenses).where(and(eq(schema.expenses.farmId, session.farmId), eq(schema.expenses.id, id)));
  if (expense) {
    const currency = await getFarmCurrency(session.farmId);
    await logActivity(session, "Deleted an expense", `${expense.category} — ${expense.description}, ${fmtMoney(expense.amount, currency)}`, "/app/expenses");
  }
  revalidatePath("/app/expenses");
  redirect("/app/expenses");
}
