import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

/** Helpers for the forgot-password flow. Kept out of the "use server" file
 * (src/lib/actions/password-reset.ts) on purpose: every function exported
 * from there becomes a publicly callable endpoint, and these are internal. */
export function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Looks up a still-usable token (exists, unused, unexpired) and its user.
 * Used by the reset page (to decide what to render) and re-checked by the
 * reset action, since a form post can be replayed. */
export async function findValidResetToken(token: string) {
  if (!token) return null;
  const [row] = await db
    .select({ id: schema.passwordResetTokens.id, userId: schema.passwordResetTokens.userId })
    .from(schema.passwordResetTokens)
    .where(
      and(
        eq(schema.passwordResetTokens.tokenHash, hashResetToken(token)),
        isNull(schema.passwordResetTokens.usedAt),
        gt(schema.passwordResetTokens.expiresAt, new Date())
      )
    )
    .limit(1);
  return row ?? null;
}
