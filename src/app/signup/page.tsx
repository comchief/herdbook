import Link from "next/link";
import { signupAction } from "@/lib/actions/auth";
import { TRIAL_DAYS } from "@/lib/subscription";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex-1 flex items-center justify-center bg-bg px-4 py-10">
      <div className="card p-8 w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="font-bold text-lg mb-1">🐖 Herdbook</div>
          <h1 className="text-xl font-bold text-ink">Set up your farm</h1>
          <p className="text-sm text-ink-soft mt-1">
            {TRIAL_DAYS} days free, then $30/month. No card needed today.
          </p>
        </div>
        {error && (
          <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>
        )}
        <form action={signupAction} className="space-y-4">
          <div className="field">
            <label>Farm name</label>
            <input name="farmName" required placeholder="Whistledown Farm" />
          </div>
          <div className="field">
            <label>Your name</label>
            <input name="ownerName" required placeholder="Jo McAllister" />
          </div>
          <div className="field">
            <label>Email</label>
            <input name="email" type="email" required placeholder="jo@whistledown.farm" />
          </div>
          <div className="field">
            <label>Password</label>
            <input name="password" type="password" required minLength={8} placeholder="At least 8 characters" />
          </div>
          <button type="submit" className="btn btn-primary w-full justify-center" style={{ padding: "11px" }}>
            Start free trial
          </button>
        </form>
        <p className="text-center text-sm text-ink-soft mt-5">
          Already have an account? <Link href="/login" className="text-accent font-semibold">Log in</Link>
        </p>
      </div>
    </div>
  );
}
