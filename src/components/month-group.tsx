"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/** One earlier month of a log table, collapsed by default into a single
 * summary row with an arrow; clicking it (or the arrow button, for keyboard
 * users) reveals that month's individual rows. Rendered as its own pair of
 * <tbody>s inside the caller's existing <table className="data">, so the
 * columns line up with the rest of the table. The rows themselves are
 * server-rendered by the caller and passed in as children — they keep their
 * own server-action forms (Delete, Reverse) — and are only mounted while
 * the group is open.
 *
 * `leadSpan` is how many leading columns the label cell covers; `trailing`
 * fills the remaining columns of the summary row, one node per column. */
export function MonthGroup({
  label,
  detail,
  leadSpan,
  trailing,
  children,
}: {
  label: string;
  detail?: string;
  leadSpan: number;
  trailing: React.ReactNode[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tbody>
        <tr className="cursor-pointer bg-surface-2" onClick={() => setOpen((o) => !o)} data-month-group={label}>
          <td colSpan={leadSpan}>
            <button
              type="button"
              className="inline-flex items-center gap-2 font-semibold text-left"
              aria-expanded={open}
              aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => !o);
              }}
            >
              <Icon name="chevron-down" className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} />
              {label}
              {detail && <span className="font-normal text-muted text-xs">{detail}</span>}
            </button>
          </td>
          {trailing.map((cell, i) => (
            <td key={i} className="num font-semibold">
              {cell}
            </td>
          ))}
        </tr>
      </tbody>
      {open && <tbody>{children}</tbody>}
    </>
  );
}
