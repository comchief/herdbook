import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionPayload } from "@/lib/session";

/** Records one line in the farm's activity log — who did what, in plain
 * language. This is what powers the activity page an owner opens from a
 * team member's card on the Team accounts screen (src/app/app/team/
 * [userId]/page.tsx): every write below is scoped to one farm, so listing
 * activityLog rows for one userId is "everything that person did on the
 * farm."
 *
 * Call this right after the write it's describing has already succeeded —
 * never before, since a redirect() on validation failure would otherwise
 * still log an action that didn't happen. Deliberately swallows its own
 * errors: a missed log line should never take down the save it's
 * describing. `href`, when given, is where the activity page links that
 * row back to (the record's own page, or the list it lives on). */
export async function logActivity(session: SessionPayload, action: string, detail: string, href?: string): Promise<void> {
  try {
    const [user] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, session.userId)).limit(1);
    await db.insert(schema.activityLog).values({
      farmId: session.farmId,
      userId: session.userId,
      userName: user?.name ?? "Unknown",
      action,
      detail,
      href: href ?? null,
    });
  } catch (err) {
    console.error("logActivity failed:", err);
  }
}
