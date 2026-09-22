import { requireSession, currentUserRecord } from "@/lib/auth";
import { updateProfileAction } from "@/lib/actions/auth";
import { Icon } from "@/components/icons";

const ROLE_LABEL: Record<string, string> = {
  owner: "Farm Owner",
  manager: "Farm Manager",
  worker: "Farm Worker",
};

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const session = await requireSession();
  const user = await currentUserRecord(session);
  const { error, saved } = await searchParams;

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold text-ink mb-6 flex items-center gap-2">
        <Icon name="user" className="w-5 h-5 text-accent" />
        Your profile
      </h1>
      {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}
      {saved && <div className="mb-4 text-sm text-good bg-accent-soft rounded-lg px-3 py-2">Name updated.</div>}

      <form action={updateProfileAction} className="card p-6 space-y-4">
        <div className="field">
          <label>Name</label>
          <input name="name" defaultValue={user?.name ?? ""} required />
        </div>
        <div className="field">
          <label>Email</label>
          <input value={user?.email ?? ""} disabled />
        </div>
        <div className="field">
          <label>Role</label>
          <input value={ROLE_LABEL[session.role] ?? session.role} disabled />
        </div>
        <button type="submit" className="btn btn-primary">
          Save name
        </button>
      </form>
    </div>
  );
}
