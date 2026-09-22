"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";

export type NavItem = { href: string; label: string; icon: string; count?: number };

/** The mobile off-canvas sidebar (see app/layout.tsx and admin/layout.tsx)
 * opens via a plain checkbox + <label> pair — no JS needed for that part.
 * But Next.js's <Link> does a client-side transition rather than a full
 * page load, so the shared layout (and the checkbox living in it) never
 * remounts between pages, and the drawer would stay open after tapping a
 * link. This one-line handler is the only JS in the sidebar, just to
 * close it back up on navigation. */
function closeMobileNav() {
  const toggle = document.getElementById("nav-toggle") as HTMLInputElement | null;
  if (toggle) toggle.checked = false;
}

/** Client component only because active-link state needs the current
 * pathname — everything else in the sidebar stays a server component. */
export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((n) => {
        const active = n.href === "/app" ? pathname === "/app" : pathname === n.href || pathname.startsWith(n.href + "/");
        return (
          <Link key={n.href} href={n.href} className={`navitem${active ? " active" : ""}`} onClick={closeMobileNav}>
            <Icon name={n.icon} />
            {n.label}
            {typeof n.count === "number" && <span className="count">{n.count}</span>}
          </Link>
        );
      })}
    </>
  );
}
