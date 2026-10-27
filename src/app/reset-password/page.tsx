import Link from "next/link";
import { resetPasswordAction } from "@/lib/actions/password-reset";
import { findValidResetToken } from "@/lib/password-reset";
import { IconSprite, Icon } from "@/components/icons";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token = "", error } = await searchParams;
  const valid = await findValidResetToken(token);
  return (
    <div className="flex-1 flex items-center justify-center bg-bg px-4 py-10">
      <IconSprite />
      <div className="card p-8 w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="brand-mark mb-3">
            <Icon name="pig" />
            <span>Herdbook</span>
          </div>
          <h1 className="text-xl font-bold text-ink">Choose a new password</h1>
        </div>
        {valid ? (
          <>
            {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}
            <form action={resetPasswordAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <div className="field">
                <label>New password</label>
                <input type="password" name="newPassword" minLength={8} required autoFocus autoComplete="new-password" placeholder="At least 8 characters" />
              </div>
              <div className="field">
                <label>Confirm new password</label>
                <input type="password" name="confirmPassword" minLength={8} required autoComplete="new-password" />
              </div>
              <button type="submit" className="btn btn-primary w-full justify-center" style={{ padding: "11px" }}>
                Update password
              </button>
            </form>
          </>
        ) : (
          <div className="text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2.5">
            This reset link has expired or was already used.{" "}
            <Link href="/forgot-password" className="font-semibold underline">
              Request a new one
            </Link>
            .
          </div>
        )}
        <p className="text-center text-sm text-ink-soft mt-5">
          <Link href="/login" className="text-accent font-semibold">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
