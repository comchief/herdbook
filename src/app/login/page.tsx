import Link from "next/link";
import { loginAction } from "@/lib/actions/auth";
import { IconSprite, Icon } from "@/components/icons";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex-1 flex items-center justify-center bg-bg px-4 py-10">
      <IconSprite />
      <div className="card p-8 w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="brand-mark mb-3">
            <Icon name="pig" />
            <span>Herdbook</span>
          </div>
          <h1 className="text-xl font-bold text-ink">Log in</h1>
        </div>
        {error && (
          <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>
        )}
        <form action={loginAction} className="space-y-4">
          <div className="field">
            <label>Email</label>
            <input name="email" type="email" required autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input name="password" type="password" required />
          </div>
          <button type="submit" className="btn btn-primary w-full justify-center" style={{ padding: "11px" }}>
            Log in
          </button>
        </form>
        <p className="text-center text-sm text-ink-soft mt-5">
          New farm? <Link href="/signup" className="text-accent font-semibold">Start a free trial</Link>
        </p>
      </div>
    </div>
  );
}
