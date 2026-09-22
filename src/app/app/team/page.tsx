import { requireOwner } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { createTeamMemberAction, removeTeamMemberAction } from "@/lib/actions/auth";
import { Icon } from "@/components/icons";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireOwner();
  await requireActiveFarm(session);
  const { error } = await searchParams;

  const members = await db.select().from(schema.users).where(eq(schema.users.farmId, session.farmId));

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink mb-1 flex items-center gap-2"><Icon name="users" className="w-5 h-5 text-accent" />Team accounts</h1>
      <p className="text-ink-soft text-sm mb-6">
        Create a login for each person on the farm. Managers have full access; Workers can view the herd,
        the feeding calendar and needs-attention items, record a mating date, and log injuries/treatments —
        but can&apos;t see Sales, Expenses, or edit pig records.
      </p>
      {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}

      <div className="card p-5 mb-6">
        <h2 className="font-bold mb-3">Add a team member</h2>
        <form action={createTeamMemberAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div className="field">
            <label>Name</label>
            <input name="name" required placeholder="Sam Rivera" />
          </div>
          <div className="field">
            <label>Role</label>
            <select name="role" defaultValue="worker">
              <option value="worker">Farm worker (limited access)</option>
              <option value="manager">Farm manager (full access)</option>
            </select>
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" name="email" required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" name="password" required minLength={8} placeholder="At least 8 characters" />
          </div>
          <div className="col-span-2">
            <button type="submit" className="btn btn-primary">
              Add account
            </button>
          </div>
        </form>
      </div>

      <div className="card divide-y divide-border">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 p-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="avatar-circle shrink-0">
                {m.avatarUrl ? (
                  <img src={m.avatarUrl} alt="" />
                ) : (
                  m.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{m.name}</div>
                <div className="text-xs text-muted truncate">{m.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`badge ${m.role === "owner" ? "badge-info" : m.role === "manager" ? "badge-good" : "badge-muted"}`}>
                {m.role}
              </span>
              {m.id !== session.userId && (
                <form action={removeTeamMemberAction}>
                  <input type="hidden" name="userId" value={m.id} />
                  <button type="submit" className="btn btn-small btn-danger">
                    Remove
                  </button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
