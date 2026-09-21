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

  await db.insert(schema.expenses).values({
    farmId: session.farmId,
    date: new Date(date),
    category: str(formData, "category") || "other",
    description,
    vendor: str(formData, "vendor") || null,
    amount,
  });

  revalidatePath("/app/expenses");
  revalidatePath("/app");
  redirect("/app/expenses");
}

export async function deleteExpenseAction(formData: FormData) {
  const session = await requireManagerSession();
  const id = str(formData, "id");
  await db.delete(schema.expenses).where(and(eq(schema.expenses.farmId, session.farmId), eq(schema.expenses.id, id)));
  revalidatePath("/app/expenses");
  redirect("/app/expenses");
}
