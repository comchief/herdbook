import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="w-60 shrink-0 bg-surface border-r border-border flex flex-col p-4 gap-1">
        <div className="font-bold text-lg px-2 pb-1">🐖 Herdbook</div>
        <div className="text-xs px-2 pb-5 text-muted font-semibold uppercase tracking-wide">Platform Admin</div>
        <Link href="/admin" className="px-3 py-2 rounded-lg text-sm font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink">
          Pending payments
        </Link>
        <Link
          href="/admin/bank-details"
          className="px-3 py-2 rounded-lg text-sm font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink"
        >
          Bank details
        </Link>
        <Link href="/app" className="px-3 py-2 rounded-lg text-sm font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink mt-4 border-t border-border pt-4">
          ← Back to my farm
        </Link>
      </aside>
      <main className="flex-1 min-w-0 p-8 max-w-4xl mx-auto w-full">{children}</main>
    </div>
  );
}
