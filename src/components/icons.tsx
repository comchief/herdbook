/** Shared SVG icon sprite — same stroke style (2px, round caps/joins) and
 * symbol set as the original Herdbook design artifact, plus a few icons
 * (users, card, shield) added for sections the artifact didn't have
 * (multi-tenant team accounts, billing, platform admin). Rendered once near
 * the root of the authenticated layouts; every icon is then just
 * `<Icon name="pig" />`. */
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="ic-grid" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </symbol>
      <symbol id="ic-pig" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12c0-3.5 3-6 8-6s8 2.5 8 6c0 1-.4 1.7-1 2.2V17l-2-.5-1 1.5h-2l-1-1.5h-2l-1 1.5H8l-1-1.5-2 .5v-2.8C4.4 13.7 4 13 4 12Z" />
        <circle cx="15.5" cy="11" r=".6" fill="currentColor" stroke="none" />
        <path d="M4 10 2 9M4 12l-2 .5" />
        <path d="M10 12h1.2" />
      </symbol>
      <symbol id="ic-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20s-7-4.4-9.5-9C1 7.5 3 4 6.5 4 9 4 11 6 12 7.5 13 6 15 4 17.5 4 21 4 23 7.5 21.5 11 19 15.6 12 20 12 20Z" />
      </symbol>
      <symbol id="ic-cross" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="4" strokeWidth="1.6" />
        <path d="M12 8v8M8 12h8" />
      </symbol>
      <symbol id="ic-wheat" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21V9" />
        <path d="M12 9c-2 0-3-1.3-3-3s1-3 3-3 3 1.3 3 3-1 3-3 3Z" />
        <path d="M9 12c-2 .2-3.2-1-3.4-2.6M15 12c2 .2 3.2-1 3.4-2.6M8.6 16.2C6.8 16.6 5.4 15.6 5 14M15.4 16.2c1.8.4 3.2-.6 3.6-2.2" />
      </symbol>
      <symbol id="ic-tag" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.6 12.3 12.3 20.6a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1 0-2.9L10.8 2H19a2 2 0 0 1 2 2v8.3Z" />
        <circle cx="15" cy="8" r="1.5" fill="currentColor" stroke="none" />
      </symbol>
      <symbol id="ic-receipt" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h12v18l-2.5-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3Z" />
        <path d="M9 8h6M9 12h6M9 16h3.5" />
      </symbol>
      <symbol id="ic-gear" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 13a7.7 7.7 0 0 0 .1-2l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5Z" />
      </symbol>
      <symbol id="ic-users" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="3.2" />
        <path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
        <circle cx="17.2" cy="8.6" r="2.4" />
        <path d="M15.8 14.7c2.6.3 4.5 2.2 5 5.3" />
      </symbol>
      <symbol id="ic-card" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="5" width="19" height="14" rx="2.2" />
        <path d="M2.5 10h19" />
        <path d="M6 15h5" />
      </symbol>
      <symbol id="ic-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 4.5 6v6c0 4.6 3 7.7 7.5 9 4.5-1.3 7.5-4.4 7.5-9V6Z" />
        <path d="m9 12 2 2 4-4.5" />
      </symbol>
      <symbol id="ic-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </symbol>
      <symbol id="ic-scale" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v18M7 7l-4 8a4 4 0 0 0 8 0Zm10 0-4 8a4 4 0 0 0 8 0ZM5 7h14" />
      </symbol>
      <symbol id="ic-alert" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 2 20h20L12 3Z" />
        <path d="M12 10v4M12 17h.01" />
      </symbol>
      <symbol id="ic-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </symbol>
      <symbol id="ic-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </symbol>
      <symbol id="ic-bell" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </symbol>
      <symbol id="ic-chevron-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6" />
      </symbol>
      <symbol id="ic-trash" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3" />
        <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
        <path d="M10 11v6M14 11v6" />
      </symbol>
      <symbol id="ic-logout" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5" />
        <path d="M21 12H9" />
      </symbol>
      <symbol id="ic-pencil" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </symbol>
      <symbol id="ic-calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="5" width="17" height="16" rx="2.2" />
        <path d="M8 3v4M16 3v4M3.5 10h17" />
      </symbol>
      <symbol id="ic-trend" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M15 7h6v6" />
      </symbol>
      <symbol id="ic-user" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="3.6" />
        <path d="M4.5 20c1-4 4-6.2 7.5-6.2S18.5 16 19.5 20" />
      </symbol>
      <symbol id="ic-truck" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 17.5V6.5a2 2 0 0 0-2-2H3.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H6" />
        <path d="M14 9.5h3.6a1 1 0 0 1 .78.37l2.4 3a1 1 0 0 1 .22.63v3a1 1 0 0 1-1 1H19" />
        <circle cx="7.5" cy="17.5" r="2" />
        <circle cx="17" cy="17.5" r="2" />
        <path d="M9.5 17.5h5.5" />
      </symbol>
      <symbol id="ic-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4.5" y="11" width="15" height="10" rx="2.2" />
        <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
        <circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none" />
      </symbol>
      <symbol id="ic-camera" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" />
        <circle cx="12" cy="13" r="3.4" />
      </symbol>
    </svg>
  );
}

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <use href={`#ic-${name}`} />
    </svg>
  );
}
