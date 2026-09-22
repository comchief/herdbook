"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";

export type NavItem = { href: string; label: string; icon: string; count?: number };

/** Client component only because active-link state needs the current
 * pathname — everything else in the sidebar stays a server component. */
export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((n) => {
        const active = n.href === "/app" ? pathname === "/app" : pathname === n.href || pathname.startsWith(n.href + "/");
        return (
          <Link key={n.href} href={n.href} className={`navitem${active ? " active" : ""}`}>
            <Icon name={n.icon} />
            {n.label}
            {typeof n.count === "number" && <span className="count">{n.count}</span>}
          </Link>
        );
      })}
    </>
  );
}
