import Link from "next/link";
import { Icon } from "@/components/icons";
import { logoutAction } from "@/lib/actions/auth";

const ROLE_LABEL: Record<string, string> = {
  owner: "Farm Owner",
  manager: "Farm Manager",
  worker: "Farm Worker",
};

/** Global app chrome: notification bell (links into the dashboard's "Needs
 * attention" list) and a profile menu. Everything here is server-renderable
 * — the dropdown is a native <details>, same pattern as the feed page's
 * inline edit forms, so no client JS is needed. */
export function Topbar({
  userName,
  userRole,
  notifCount,
  isOwner,
}: {
  userName: string;
  userRole: string;
  notifCount: number;
  isOwner: boolean;
}) {
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="topbar">
      <Link href="/app" className="topbar-icon-btn" aria-label={notifCount > 0 ? `${notifCount} items need attention` : "Notifications"}>
        <Icon name="bell" />
        {notifCount > 0 && <span className="dot" />}
      </Link>
      <details className="profile-menu">
        <summary className="profile-trigger">
          <div className="avatar-circle">{initials || "?"}</div>
          <div>
            <div className="profile-name">{userName}</div>
            <div className="profile-role">{ROLE_LABEL[userRole] ?? userRole}</div>
          </div>
          <Icon name="chevron-down" className="chev" />
        </summary>
        <div className="profile-dropdown">
          {isOwner && (
            <>
              <Link href="/app/settings">
                <Icon name="gear" />
                Farm settings
              </Link>
              <Link href="/app/team">
                <Icon name="users" />
                Team accounts
              </Link>
              <Link href="/app/billing">
                <Icon name="card" />
                Billing
              </Link>
              <hr />
            </>
          )}
          <form action={logoutAction}>
            <button type="submit">
              <Icon name="logout" />
              Log out
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
