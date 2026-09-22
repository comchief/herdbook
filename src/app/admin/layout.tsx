import { requirePlatformAdmin } from "@/lib/auth";
import { IconSprite, Icon } from "@/components/icons";
import { SidebarNav } from "@/components/sidebar-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  return (
    <div className="flex min-h-screen bg-bg">
      {/* Same CSS-only off-canvas pattern as app/layout.tsx. */}
      <input type="checkbox" id="nav-toggle" className="peer/nav hidden" aria-hidden="true" />
      <IconSprite />
      <label
        htmlFor="nav-toggle"
        className="hidden peer-checked/nav:block fixed inset-0 bg-black/40 z-40 md:hidden"
        aria-hidden="true"
      />
      <aside className="w-[236px] max-w-[82vw] shrink-0 bg-surface border-r border-border flex flex-col fixed md:sticky top-0 left-0 h-screen p-3.5 gap-1 z-50 overflow-y-auto -translate-x-full peer-checked/nav:translate-x-0 md:translate-x-0 transition-transform duration-200">
        <div className="flex items-center gap-2.5 px-2 pb-4">
          <Icon name="pig" className="w-6 h-6 text-accent" />
          <div>
            <div className="font-display font-bold text-[19px] leading-tight">Herdbook</div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted -mt-0.5">Platform Admin</div>
          </div>
        </div>
        <div className="navgroup-label">Platform</div>
        <SidebarNav
          items={[
            { href: "/admin", label: "Pending payments", icon: "receipt" },
            { href: "/admin/bank-details", label: "Bank details", icon: "card" },
            { href: "/admin/growth-rules", label: "Growth stage rules", icon: "trend" },
          ]}
        />
        <div className="mt-auto pt-3 border-t border-border">
          <SidebarNav items={[{ href: "/app", label: "Back to my farm", icon: "grid" }]} />
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-4 md:p-8 max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-4 md:hidden">
          <label htmlFor="nav-toggle" className="topbar-icon-btn" aria-label="Open menu">
            <Icon name="menu" />
          </label>
          <div className="font-display font-bold text-[15px]">Platform Admin</div>
        </div>
        {children}
      </main>
    </div>
  );
}
