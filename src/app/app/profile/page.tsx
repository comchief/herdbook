import { requireSession, currentUserRecord } from "@/lib/auth";
import {
  updateProfileAction,
  updateAvatarAction,
  removeAvatarAction,
  changePasswordAction,
  requestAccountDeletionAction,
  cancelAccountDeletionAction,
} from "@/lib/actions/auth";
import { Icon } from "@/components/icons";
import { fmtDate } from "@/lib/format";

const ROLE_LABEL: Record<string, string> = {
  owner: "Farm Owner",
  manager: "Farm Manager",
  worker: "Farm Worker",
};

type Notice = { text: string; tone: "good" | "critical" };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    photoSaved?: string;
    photoRemoved?: string;
    passwordChanged?: string;
    deletionRequested?: string;
    deletionCanceled?: string;
  }>;
}) {
  const session = await requireSession();
  const user = await currentUserRecord(session);
  const { error, saved, photoSaved, photoRemoved, passwordChanged, deletionRequested, deletionCanceled } = await searchParams;

  const notices: Notice[] = [];
  if (error) notices.push({ text: error, tone: "critical" });
  if (saved) notices.push({ text: "Name updated.", tone: "good" });
  if (photoSaved) notices.push({ text: "Profile photo updated.", tone: "good" });
  if (photoRemoved) notices.push({ text: "Profile photo removed.", tone: "good" });
  if (passwordChanged) notices.push({ text: "Password changed.", tone: "good" });
  if (deletionRequested) notices.push({ text: "Deletion request received — our team will follow up by email.", tone: "good" });
  if (deletionCanceled) notices.push({ text: "Deletion request canceled.", tone: "good" });

  const initials = (user?.name ?? "")
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-ink mb-6 flex items-center gap-2">
        <Icon name="user" className="w-5 h-5 text-accent" />
        Your profile
      </h1>

      {notices.map((n, i) => (
        <div
          key={i}
          className={`mb-4 text-sm rounded-lg px-3 py-2 ${n.tone === "critical" ? "text-critical bg-[#fbdada]" : "text-good bg-accent-soft"}`}
        >
          {n.text}
        </div>
      ))}

      <div className="grid grid-cols-[1fr_260px] gap-3.5 items-start">
        <div className="space-y-3.5">
          <form action={updateProfileAction} className="card p-6 space-y-4">
            <h2 className="font-bold text-ink -mt-1 mb-1">Account details</h2>
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

          <form id="password" action={changePasswordAction} className="card p-6 space-y-4 scroll-mt-4">
            <h2 className="font-bold text-ink -mt-1 mb-1 flex items-center gap-2">
              <Icon name="lock" className="w-4 h-4 text-accent" />
              Change password
            </h2>
            <div className="field">
              <label>Current password</label>
              <input type="password" name="currentPassword" autoComplete="current-password" required />
            </div>
            <div className="field">
              <label>New password</label>
              <input type="password" name="newPassword" autoComplete="new-password" minLength={8} required />
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input type="password" name="confirmPassword" autoComplete="new-password" minLength={8} required />
            </div>
            <button type="submit" className="btn btn-primary">
              Update password
            </button>
          </form>

          <div id="delete" className="card p-6 space-y-4 scroll-mt-4">
            <h2 className="font-bold text-ink -mt-1 mb-1 flex items-center gap-2">
              <Icon name="trash" className="w-4 h-4 text-critical" />
              Delete account
            </h2>

            {user?.deletionRequestedAt ? (
              <>
                <div className="text-sm rounded-lg px-3 py-2.5 bg-[#fdecc8] text-[#7a4a08]">
                  <b>Deletion requested</b> on {fmtDate(user.deletionRequestedAt)}. Our team will follow up by email before anything is
                  removed — you can cancel any time before then.
                </div>
                <form action={cancelAccountDeletionAction}>
                  <button type="submit" className="btn">
                    Cancel deletion request
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="text-sm rounded-lg px-3 py-2.5 bg-[#fdecc8] text-[#7a4a08]">
                  <b>Are you sure you want to delete your account?</b>
                  <br />
                  {session.role === "owner"
                    ? "As the farm owner, this removes your whole farm — every pig, record, and teammate login along with it. This can't be undone."
                    : "Once your account is removed you'll lose access to this farm. This can't be undone."}
                </div>
                <form action={requestAccountDeletionAction} className="space-y-3">
                  <label className="flex items-start gap-2 text-sm font-semibold text-ink">
                    <input type="checkbox" name="confirm" required className="mt-0.5" />
                    I confirm my account deactivation and deletion
                  </label>
                  <button type="submit" className="btn btn-danger">
                    Delete account
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        <div className="card p-6 text-center">
          {/* React sets encType/method for a function action automatically
              (and detects the file input to use multipart) — setting them
              here just triggers a dev warning that they'll be overridden. */}
          <form action={updateAvatarAction} id="avatarForm" className="contents">
            <input type="file" name="avatar" accept="image/*" id="avatarInput" className="sr-only" />
          </form>
          <div className="avatar-lg-wrap">
            <div className="avatar-lg">{user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials || "?"}</div>
            <label htmlFor="avatarInput" className="avatar-cam-btn" aria-label="Choose a new photo">
              <Icon name="camera" />
            </label>
          </div>
          <div className="font-bold text-ink">{user?.name ?? ""}</div>
          <div className="text-ink-soft text-sm mb-4">{ROLE_LABEL[session.role] ?? session.role}</div>
          <button type="submit" form="avatarForm" className="btn btn-primary w-full mb-2">
            Upload photo
          </button>
          {user?.avatarUrl && (
            <form action={removeAvatarAction}>
              <button type="submit" className="btn w-full">
                Remove photo
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
