import { requireOwner } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { and, eq, desc } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { fmtDateTime } from "@/lib/format";

// Caps how far back the page reads — an owner reviewing a team member's
// activity wants the recent picture, not their whole tenure; capping also
// keeps this page fast for a farm that's been running a long time.
const ACTIVITY_LIMIT = 300;

/** "Everything that was done on the farm" by one team member — reached by
 * clicking their card on the Team accounts screen. Owner-only, same as the
 * team list itself. Reads src/lib/activity.ts's activityLog rows, which
 * every write-worthy server action inserts into right after its own save
 * succeeds (see logActivity's call sites across src/lib/actions/*.ts). */
export default async function TeamMemberActivityPage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await requireOwner();
  const farm = await requireActiveFarm(session);
  const { userId } = await params;

  const [member] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), eq(schema.users.farmId, session.farmId)))
    .limit(1);
  if (!member) notFound();

  const activity = await db
    .select()
    .from(schema.activityLog)
    .where(and(eq(schema.activityLog.farmId, session.farmId), eq(schema.activityLog.userId, userId)))
    .orderBy(desc(schema.activityLog.createdAt))
    .limit(ACTIVITY_LIMIT);

  const initials = member.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="avatar-circle shrink-0">{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : initials}</div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-ink flex items-center gap-2 flex-wrap">
              <span className="break-words">{member.name}</span>
              <span className={`badge ${member.role === "owner" ? "badge-info" : member.role === "manager" ? "badge-good" : "badge-muted"}`}>
                {member.role}
              </span>
            </h1>
            <p className="text-ink-soft text-sm truncate">{member.email}</p>
          </div>
        </div>
        <Link href="/app/team" className="btn shrink-0">
          Back
        </Link>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">Activity on the farm</h2>
          {activity.length > 0 && (
            <span className="text-[11.5px] text-muted">
              {activity.length} {activity.length === 1 ? "entry" : "entries"}
              {activity.length === ACTIVITY_LIMIT ? " (most recent)" : ""}
            </span>
          )}
        </div>

        {activity.length === 0 && (
          <div className="text-sm text-muted py-8 text-center">
            <Icon name="calendar" className="w-5 h-5 mx-auto mb-2 text-muted" />
            Nothing recorded for {member.name} yet.
          </div>
        )}

        <div className="flex flex-col">
          {activity.map((a) => {
            const body = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{a.action}</div>
                  <div className="text-[11px] text-muted whitespace-nowrap num">{fmtDateTime(a.createdAt, farm.timezone)}</div>
                </div>
                <div className="text-xs text-muted mt-0.5">{a.detail}</div>
              </>
            );
            return a.href ? (
              <Link
                key={a.id}
                href={a.href}
                className="py-3 border-t border-border first:border-t-0 rounded-lg px-2 -mx-2 hover:bg-surface-2"
              >
                {body}
              </Link>
            ) : (
              <div key={a.id} className="py-3 border-t border-border first:border-t-0 px-2 -mx-2">
                {body}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
