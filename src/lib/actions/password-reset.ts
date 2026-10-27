"use server";

import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPassword } from "@/lib/auth";
import { sendEmail, appBaseUrl } from "@/lib/email";
import { hashResetToken, findValidResetToken } from "@/lib/password-reset";

const TOKEN_TTL_MS = 60 * 60 * 1000; // links stay valid for one hour
const RESEND_COOLDOWN_MS = 60 * 1000; // at most one new link per account per minute

/** "Forgot password" form on the login page. Always ends on the same
 * confirmation message whether or not the email has an account (and whether
 * or not the email could be delivered), so the form can't be used to find
 * out which addresses are registered. */
export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) redirect("/forgot-password?error=" + encodeURIComponent("Enter the email you signed up with."));

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (user) {
    const [latest] = await db
      .select({ createdAt: schema.passwordResetTokens.createdAt })
      .from(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.userId, user.id))
      .orderBy(desc(schema.passwordResetTokens.createdAt))
      .limit(1)
      .then((rows) => rows);
    const tooSoon = latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS;

    if (!tooSoon) {
      const token = randomBytes(32).toString("base64url");
      // A new link voids any older unused ones for this account.
      await db
        .update(schema.passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(schema.passwordResetTokens.userId, user.id), isNull(schema.passwordResetTokens.usedAt)));
      await db.insert(schema.passwordResetTokens).values({
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      });

      const link = `${appBaseUrl()}/reset-password?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: "Reset your Herdbook password",
        text: `Hi ${user.name},\n\nUse this link to choose a new Herdbook password (it works once and expires in 1 hour):\n\n${link}\n\nIf you didn't ask for this, you can ignore this email — your password won't change.`,
        html: `<p>Hi ${escapeHtml(user.name)},</p><p>Use this link to choose a new Herdbook password. It works once and expires in 1 hour.</p><p><a href="${link}">Reset my password</a></p><p style="color:#666;font-size:13px">If you didn't ask for this, you can ignore this email — your password won't change.</p>`,
      });
    }
  }

  redirect("/forgot-password?sent=1");
}

/** Sets the new password from an emailed link. Doesn't sign the user in —
 * they go back to the login page and use the new password. */
export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const back = `/reset-password?token=${encodeURIComponent(token)}&error=`;

  const valid = await findValidResetToken(token);
  if (!valid) redirect("/forgot-password?error=" + encodeURIComponent("That reset link has expired or was already used. Request a new one."));
  if (newPassword.length < 8) redirect(back + encodeURIComponent("Passwords need at least 8 characters."));
  if (newPassword !== confirmPassword) redirect(back + encodeURIComponent("The two passwords don't match."));

  await db.update(schema.users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(schema.users.id, valid.userId));
  // Spend this link and any other outstanding ones for the account.
  await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.passwordResetTokens.userId, valid.userId), isNull(schema.passwordResetTokens.usedAt)));

  redirect("/login?reset=1");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
