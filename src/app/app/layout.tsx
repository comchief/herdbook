import { requireSession, currentUserRecord } from "@/lib/auth";
import { loadFarm } from "@/lib/gate";
import { subscriptionStatus, daysRemaining } from "@/lib/subscription";
import { logoutAction } from "@/lib/actions/auth";
import { needsAttentionCount } from "@/lib/needs-attention";
import { db, schema } from "@/db";
import { eq, count } from "drizzle-orm";
import { IconSprite, Icon } from "@/components/icons";
import { SidebarNav, type NavItem } from "@/components/sidebar-nav";
import { Topbar } from "@/components/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const farm = await loadFarm(session);
  const status = subscriptionStatus(farm);

  const [[{ pigCount }], user, notifCount] = await Promise.all([
    db.select({ pigCount: count() }).from(schema.pigs).where(eq(schema.pigs.farmId, session.farmId)),
    currentUserRecord(session),
    needsAttentionCount(session.farmId),
  ]);

  const herdItems: NavItem[] = [
    { href: "/app/pigs", label: "Pig Registry", icon: "pig", count: pigCount },
    { href: "/app/breeding", label: "Breeding & Pregnancy", icon: "heart" },
    { href: "/app/medical", label: "Health & Medical", icon: "cross" },
  ];
  const opsItems: NavItem[] = [
    { href: "/app/feed", label: "Feed Management", icon: "wheat" },
    ...(session.role !== "worker" ? [{ href: "/app/sales", label: "Slaughter & Sales", icon: "tag" }] : []),
    ...(session.role !== "worker" ? [{ href: "/app/expenses", label: "Expenses", icon: "receipt" }] : []),
  ];
  const accountItems: NavItem[] = [
    ...(session.role === "owner" ? [{ href: "/app/team", label: "Team Accounts", icon: "users" }] : []),
    ...(session.role === "owner" ? [{ href: "/app/settings", label: "Farm Settings", icon: "gear" }] : []),
    ...(session.role === "owner" ? [{ href: "/app/billing", label: "Billing", icon: "card" }] : []),
  ];

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Off-canvas mobile nav, CSS-only (no JS beyond SidebarNav's own
       * close-on-navigate): the checkbox is toggled by the topbar's
       * hamburger <label> and by the backdrop's <label>, and Tailwind's
       * peer-checked variant slides the sidebar in. Below md it starts
       * hidden off-screen; at md and up it's always shown in normal flow
       * and this checkbox has no effect. */}
      <input type="checkbox" id="nav-toggle" className="peer/nav hidden" aria-hidden="true" />
      <IconSprite />
      <label
        htmlFor="nav-toggle"
        className="hidden peer-checked/nav:block fixed inset-0 bg-black/40 z-40 md:hidden"
        aria-hidden="true"
      />
      <aside className="w-[236px] max-w-[82vw] shrink-0 bg-surface border-r border-border flex flex-col fixed md:sticky top-0 left-0 h-screen p-3.5 gap-1 z-50 overflow-y-auto -translate-x-full peer-checked/nav:translate-x-0 md:translate-x-0 transition-transform duration-200">
        <div id="sidebar-brand" className="flex items-center gap-2.5 px-2 pb-4">
          <Icon name="pig" className="w-6 h-6" />
          <div>
            <div className="font-display font-bold text-[19px] leading-tight">Herdbook</div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted -mt-0.5">{farm.name}</div>
          </div>
        </div>

        <div className="navgroup-label">Overview</div>
        <SidebarNav items={[{ href: "/app", label: "Dashboard", icon: "grid" }]} />

        <div className="navgroup-label">Herd</div>
        <SidebarNav items={herdItems} />

        {opsItems.length > 0 && (
          <>
            <div className="navgroup-label">Operations</div>
            <SidebarNav items={opsItems} />
          </>
        )}

        {accountItems.length > 0 && (
          <>
            <div className="navgroup-label">Account</div>
            <SidebarNav items={accountItems} />
          </>
        )}

        {session.isPlatformAdmin && (
          <>
            <div className="navgroup-label">Platform</div>
            <SidebarNav items={[{ href: "/admin", label: "Platform Admin", icon: "shield" }]} />
          </>
        )}

        <div className="mt-auto pt-3 border-t border-border text-[11.5px] text-muted leading-relaxed px-1">
          {status === "trialing" && <div>Trial — {daysRemaining(farm.trialEndsAt)} days left</div>}
          {status === "active" && <div className="text-good font-semibold">Subscription active</div>}
          {status === "expired" && <div className="text-critical font-semibold">Subscription expired</div>}
          <form action={logoutAction} className="mt-1.5">
            <button type="submit" className="text-ink-soft hover:text-ink font-semibold">
              Log out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-4 md:px-8 pb-8 max-w-5xl mx-auto w-full">
        <Topbar
          userName={user?.name ?? "Account"}
          userRole={session.role}
          notifCount={notifCount}
          isOwner={session.role === "owner"}
          avatarUrl={user?.avatarUrl ?? null}
        />
        {children}
      </main>
    </div>
  );
}
