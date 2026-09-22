import Link from "next/link";
import { readSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { MONTHLY_PRICE_USD, TRIAL_DAYS } from "@/lib/subscription";
import { IconSprite, Icon } from "@/components/icons";

export default async function Home() {
  const session = await readSession();
  if (session) redirect("/app");

  return (
    <div className="flex-1 bg-bg">
      <IconSprite />
      <header className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto">
        <div className="brand-mark">
          <Icon name="pig" />
          <span>Herdbook</span>
        </div>
        <nav className="flex gap-3">
          <Link href="/login" className="btn">Log in</Link>
          <Link href="/signup" className="btn btn-primary">Start free trial</Link>
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-ink mb-4">
          Run every farm's herd from one place.
        </h1>
        <p className="text-lg text-ink-soft mb-8">
          Breeding, health, feed, sales and expenses — one account per farm, your own
          team logins, and a dashboard that tells you what needs attention today.
        </p>
        <div className="flex items-center justify-center gap-3 mb-3">
          <Link href="/signup" className="btn btn-primary" style={{ padding: "12px 22px", fontSize: 14 }}>
            Start your {TRIAL_DAYS}-day free trial
          </Link>
        </div>
        <p className="text-sm text-muted">No card required to start. Cancel any time.</p>
      </main>

      <section className="max-w-3xl mx-auto px-6 py-10">
        <div className="card p-8 text-center">
          <div className="text-sm font-bold uppercase tracking-wide text-muted mb-2">Simple pricing</div>
          <div className="text-5xl font-bold text-ink mb-1">
            ${MONTHLY_PRICE_USD}<span className="text-lg font-medium text-muted">/month</span>
          </div>
          <p className="text-ink-soft mb-6">
            Full access for your whole team. First {TRIAL_DAYS} days are free.
          </p>
          <ul className="text-left max-w-sm mx-auto space-y-2 text-sm text-ink-soft mb-6">
            <li>✓ Unlimited pigs, breeding &amp; medical records</li>
            <li>✓ Feed inventory, rations &amp; a daily feeding calendar</li>
            <li>✓ Sales, expenses and a profit/loss dashboard</li>
            <li>✓ Owner, manager and farm-worker logins with role-based access</li>
          </ul>
          <p className="text-xs text-muted">
            Paid by local bank transfer — after signup, we'll show you where to send it and
            confirm it within one business day.
          </p>
        </div>
      </section>

      <footer className="text-center text-xs text-muted py-10">Herdbook — farm management, made simple.</footer>
    </div>
  );
}
