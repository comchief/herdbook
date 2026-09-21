import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { loadFarm } from "@/lib/gate";
import { subscriptionStatus, daysRemaining } from "@/lib/subscription";
import { logoutAction } from "@/lib/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const farm = await loadFarm(session);
  const status = subscriptionStatus(farm);

  const navItems: { href: string; label: string; show: boolean }[] = [
    { href: "/app", label: "Dashboard", show: true },
    { href: "/app/pigs", label: "Pig Registry", show: true },
    { href: "/app/breeding", label: "Breeding & Pregnancy", show: true },
    { href: "/app/medical", label: "Health & Medical", show: true },
    { href: "/app/feed", label: "Feed Management", show: true },
    { href: "/app/sales", label: "Slaughter & Sales", show: session.role !== "worker" },
    { href: "/app/expenses", label: "Expenses", show: session.role !== "worker" },
    { href: "/app/team", label: "Team Accounts", show: session.role === "owner" },
    { href: "/app/settings", label: "Farm Settings", show: session.role === "owner" },
    { href: "/app/billing", label: "Billing", show: session.role === "owner" },
  ];

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="w-60 shrink-0 bg-surface border-r border-border flex flex-col p-4 gap-1">
        <div className="font-bold text-lg px-2 pb-5">🐖 Herdbook</div>
        <div className="text-xs px-2 pb-2 text-muted font-semibold uppercase tracking-wide">{farm.name}</div>
        {navItems
          .filter((n) => n.show)
          .map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="px-3 py-2 rounded-lg text-sm font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink"
            >
              {n.label}
            </Link>
          ))}
        {session.isPlatformAdmin && (
          <Link
            href="/admin"
            className="px-3 py-2 rounded-lg text-sm font-semibold text-info hover:bg-surface-2 mt-2 border-t border-border pt-3"
          >
            Platform Admin
          </Link>
        )}
        <div className="mt-auto pt-4 border-t border-border text-xs text-muted">
          {status === "trialing" && <div>Trial — {daysRemaining(farm.trialEndsAt)} days left</div>}
          {status === "active" && <div className="text-good font-semibold">Subscription active</div>}
          {status === "expired" && <div className="text-critical font-semibold">Subscription expired</div>}
          <form action={logoutAction} className="mt-2">
            <button type="submit" className="text-ink-soft hover:text-ink font-semibold">
              Log out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-8 max-w-5xl mx-auto w-full">{children}</main>
    </div>
  );
}
