import Link from "next/link";
import { requestPasswordResetAction } from "@/lib/actions/password-reset";
import { IconSprite, Icon } from "@/components/icons";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  return (
    <div className="flex-1 flex items-center justify-center bg-bg px-4 py-10">
      <IconSprite />
      <div className="card p-8 w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="brand-mark mb-3">
            <Icon name="pig" />
            <span>Herdbook</span>
          </div>
          <h1 className="text-xl font-bold text-ink">Forgot your password?</h1>
          <p className="text-sm text-ink-soft mt-1">Enter your email and we&apos;ll send you a link to choose a new one.</p>
        </div>
        {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}
        {sent ? (
          <div className="mb-4 text-sm text-good bg-accent-soft rounded-lg px-3 py-2.5">
            If that email has an account, a reset link is on its way. It works once and expires in 1 hour. Check your spam folder if
            it doesn&apos;t show up.
          </div>
        ) : (
          <form action={requestPasswordResetAction} className="space-y-4">
            <div className="field">
              <label>Email</label>
              <input name="email" type="email" required autoFocus autoComplete="email" />
            </div>
            <button type="submit" className="btn btn-primary w-full justify-center" style={{ padding: "11px" }}>
              Send reset link
            </button>
          </form>
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
