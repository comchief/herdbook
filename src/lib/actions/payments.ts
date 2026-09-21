"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSession } from "@/lib/session";
import { MONTHLY_PRICE_USD } from "@/lib/subscription";

export async function submitPaymentAction(formData: FormData) {
  const session = await readSession();
  if (!session || session.role !== "owner") redirect("/login");

  const bankReference = String(formData.get("bankReference") || "").trim();
  const payerName = String(formData.get("payerName") || "").trim();
  const periodMonths = Math.max(1, Number(formData.get("periodMonths")) || 1);
  const note = String(formData.get("note") || "").trim() || null;

  if (!bankReference || !payerName) {
    redirect("/app/billing?error=" + encodeURIComponent("Enter the payer name and the bank's transaction reference."));
  }

  await db.insert(schema.paymentSubmissions).values({
    farmId: session!.farmId,
    amountClaimed: MONTHLY_PRICE_USD * periodMonths,
    currency: "USD",
    periodMonths,
    bankReference,
    payerName,
    note,
    status: "pending",
  });

  redirect("/app/billing?submitted=1");
}

export async function approvePaymentAction(formData: FormData) {
  const session = await readSession();
  if (!session || !session.isPlatformAdmin) redirect("/app");

  const paymentId = String(formData.get("paymentId") || "");
  const [payment] = await db
    .select()
    .from(schema.paymentSubmissions)
    .where(eq(schema.paymentSubmissions.id, paymentId))
    .limit(1);
  if (!payment || payment.status !== "pending") redirect("/admin");

  const [farm] = await db.select().from(schema.farms).where(eq(schema.farms.id, payment.farmId)).limit(1);
  if (!farm) redirect("/admin");

  const now = new Date();
  const base = farm!.paidThroughDate && farm!.paidThroughDate.getTime() > now.getTime() ? farm!.paidThroughDate : now;
  const newPaidThrough = new Date(base);
  newPaidThrough.setMonth(newPaidThrough.getMonth() + payment.periodMonths);

  await db.update(schema.farms).set({ paidThroughDate: newPaidThrough }).where(eq(schema.farms.id, farm!.id));
  await db
    .update(schema.paymentSubmissions)
    .set({ status: "approved", reviewedById: session!.userId, reviewedAt: now })
    .where(eq(schema.paymentSubmissions.id, paymentId));

  redirect("/admin");
}

export async function rejectPaymentAction(formData: FormData) {
  const session = await readSession();
  if (!session || !session.isPlatformAdmin) redirect("/app");

  const paymentId = String(formData.get("paymentId") || "");
  const reviewNote = String(formData.get("reviewNote") || "").trim() || null;

  await db
    .update(schema.paymentSubmissions)
    .set({ status: "rejected", reviewedById: session.userId, reviewedAt: new Date(), reviewNote })
    .where(eq(schema.paymentSubmissions.id, paymentId));

  redirect("/admin");
}

export async function updateBankDetailsAction(formData: FormData) {
  const session = await readSession();
  if (!session || !session.isPlatformAdmin) redirect("/app");

  const values = {
    bankName: String(formData.get("bankName") || "").trim(),
    accountName: String(formData.get("accountName") || "").trim(),
    accountNumber: String(formData.get("accountNumber") || "").trim(),
    branch: String(formData.get("branch") || "").trim(),
    routingSwift: String(formData.get("routingSwift") || "").trim(),
    instructions: String(formData.get("instructions") || "").trim(),
  };

  await db
    .insert(schema.platformBankDetails)
    .values({ id: "singleton", ...values })
    .onConflictDoUpdate({ target: schema.platformBankDetails.id, set: values });

  redirect("/admin/bank-details?saved=1");
}
