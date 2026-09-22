import { requirePlatformAdmin } from "@/lib/auth";
import { IconSprite, Icon } from "@/components/icons";
import { SidebarNav } from "@/components/sidebar-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  return (
    <div className="flex min-h-screen bg-bg">
      <IconSprite />
      <aside className="w-[236px] shrink-0 bg-surface border-r border-border flex flex-col sticky top-0 h-screen p-3.5 gap-1">
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
          ]}
        />
        <div className="mt-auto pt-3 border-t border-border">
          <SidebarNav items={[{ href: "/app", label: "Back to my farm", icon: "grid" }]} />
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-8 max-w-4xl mx-auto w-full">{children}</main>
    </div>
  );
}
