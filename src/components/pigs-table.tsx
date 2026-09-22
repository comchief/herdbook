"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { growthStatus } from "@/lib/growth";
import { deletePigAction } from "@/lib/actions/pigs";

export type PigRow = {
  id: string;
  tag: string;
  name: string;
  breed: string | null;
  sexBase: string;
  dob: Date | null;
  acquiredDate: Date | null;
  pen: string | null;
  currentWeightKg: number;
  status: string;
  targetWeightKg: number | null;
  targetMonths: number | null;
};

const STATUS_STYLE: Record<string, { cls: string; label: string }> = {
  piglet: { cls: "info", label: "Piglet" },
  weaner: { cls: "info", label: "Weaner" },
  grower: { cls: "muted", label: "Grower" },
  finisher: { cls: "warn", label: "Finisher" },
  "breeding-sow": { cls: "good", label: "Breeding sow" },
  "breeding-boar": { cls: "good", label: "Breeding boar" },
};

const FILTERS: { key: string; label: string; match: (status: string) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "piglet", label: "Piglets", match: (s) => s === "piglet" },
  { key: "weaner", label: "Weaners", match: (s) => s === "weaner" },
  { key: "grower", label: "Growers", match: (s) => s === "grower" },
  { key: "finisher", label: "Finishers", match: (s) => s === "finisher" },
  { key: "breeding", label: "Breeding stock", match: (s) => s === "breeding-sow" || s === "breeding-boar" },
];

function ageLabel(d: Date) {
  const days = Math.round((Date.now() - d.getTime()) / 86400000);
  if (days < 21) return `${days}d`;
  if (days < 210) return `${Math.floor(days / 7)}w`;
  return `${(days / 30.44).toFixed(0)}mo`;
}

function AgeCell({ pig }: { pig: PigRow }) {
  if (pig.dob) return <td className="num">{ageLabel(pig.dob)}</td>;
  if (pig.acquiredDate)
    return (
      <td className="num" title="Approximate — based on acquired date, birth date unknown">
        {ageLabel(pig.acquiredDate)}*
      </td>
    );
  return <td className="num text-muted">—</td>;
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { cls: "muted", label: status };
  return (
    <span className={`badge badge-${s.cls}`}>
      <span className="badge-dot" />
      {s.label}
    </span>
  );
}

function GrowthBadge({ pig }: { pig: PigRow }) {
  const g = growthStatus(pig);
  if (!g) return <span className="badge badge-muted">—</span>;
  return <span className={`badge badge-${g.cls}`}>{g.label} · {g.pct}%</span>;
}

export function PigsTable({ pigs, isManager }: { pigs: PigRow[]; isManager: boolean }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FILTERS) c[f.key] = pigs.filter((p) => f.match(p.status)).length;
    return c;
  }, [pigs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
    return pigs.filter((p) => {
      if (!activeFilter.match(p.status)) return false;
      if (!q) return true;
      return (
        p.tag.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.breed ?? "").toLowerCase().includes(q)
      );
    });
  }, [pigs, query, filter]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="search-input-wrap">
          <Icon name="search" />
          <input
            type="text"
            placeholder="Search by tag, name or breed…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filter-pills">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`filter-pill ${filter === f.key ? "active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label} ({counts[f.key] ?? 0})
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>Pig</th>
              <th>Tag</th>
              <th>Breed</th>
              <th>Sex</th>
              <th className="num">Age</th>
              <th>Pen</th>
              <th className="num">Weight</th>
              <th>Status</th>
              <th>Growth</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td className="font-semibold">{p.name}</td>
                <td className="tag">{p.tag}</td>
                <td>{p.breed || "—"}</td>
                <td>{p.sexBase}</td>
                <AgeCell pig={p} />
                <td>{p.pen || "—"}</td>
                <td className="num">{p.currentWeightKg.toFixed(1)} kg</td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td>
                  <GrowthBadge pig={p} />
                </td>
                <td className="text-right whitespace-nowrap">
                  <Link href={`/app/pigs/${encodeURIComponent(p.tag)}`} className="icon-btn mr-1.5" aria-label={`View ${p.name}`}>
                    <Icon name="eye" />
                  </Link>
                  {isManager && (
                    <>
                      <Link
                        href={`/app/pigs/${encodeURIComponent(p.tag)}/edit`}
                        className="icon-btn mr-1.5"
                        aria-label={`Edit ${p.name}`}
                      >
                        <Icon name="pencil" />
                      </Link>
                      <form action={deletePigAction} className="inline">
                        <input type="hidden" name="tag" value={p.tag} />
                        <button type="submit" className="icon-btn danger" aria-label={`Delete ${p.name}`}>
                          <Icon name="trash" />
                        </button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-muted py-10">
                  {pigs.length === 0 ? "No pigs yet." : "No pigs match your search or filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
