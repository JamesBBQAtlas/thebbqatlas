"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Sparkles, Search, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { STYLE_LABELS, type BbqStyle } from "@/lib/constants/styles";
import { CATEGORY_LABELS } from "@/lib/constants/categories";
import type { MapItemCategory } from "@/lib/types/database";
import { freshness, FRESH_TONE_CLASSES, FRESH_DOT, type Fresh } from "@/lib/admin/freshness";

export interface ListingRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  style: string;
  category: string | null;
  status: string;
  enriched_at: string | null;
  website: string | null;
  phone: string | null;
  instagram_url: string | null;
  has_hours: boolean;
}

type SortKey = "name" | "country" | "enriched";
type Dir = "asc" | "desc";

const FRESH_FILTERS: { key: "all" | Fresh; label: string; tone?: Fresh }[] = [
  { key: "all", label: "All" },
  { key: "green", label: "Fresh", tone: "green" },
  { key: "amber", label: "Ageing", tone: "amber" },
  { key: "red", label: "Stale / never", tone: "red" },
];

function gaps(r: ListingRow): string[] {
  return [
    !r.website && "site",
    !r.phone && "phone",
    !r.has_hours && "hours",
    !r.instagram_url && "IG",
  ].filter(Boolean) as string[];
}

export function ListingsTable({ rows }: { rows: ListingRow[] }) {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("all");
  const [fresh, setFresh] = useState<"all" | Fresh>("all");
  const [sortKey, setSortKey] = useState<SortKey>("enriched");
  const [dir, setDir] = useState<Dir>("asc");

  const countries = useMemo(
    () => [...new Set(rows.map((r) => r.country).filter(Boolean) as string[])].sort(),
    [rows]
  );

  // Search + country first (freshness chip counts reflect this scope).
  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (country !== "all" && r.country !== country) return false;
      if (needle) {
        const hay = `${r.name} ${r.city ?? ""} ${r.country ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, country]);

  const freshCounts = useMemo(() => {
    const c: Record<string, number> = { all: base.length, green: 0, amber: 0, red: 0 };
    for (const r of base) c[freshness(r.enriched_at).tone]++;
    return c;
  }, [base]);

  const view = useMemo(() => {
    const filtered =
      fresh === "all" ? base : base.filter((r) => freshness(r.enriched_at).tone === fresh);
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "country")
        cmp = (a.country ?? "").localeCompare(b.country ?? "");
      else {
        const ta = a.enriched_at ? new Date(a.enriched_at).getTime() : -Infinity;
        const tb = b.enriched_at ? new Date(b.enriched_at).getTime() : -Infinity;
        cmp = ta - tb;
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [base, fresh, sortKey, dir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDir(key === "enriched" ? "asc" : "asc");
    }
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? (
      <ArrowUpDown className="h-3 w-3 opacity-40" />
    ) : dir === "asc" ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, city, country…"
            className="w-72 rounded-md border border-border-default bg-surface-0 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none"
          />
        </div>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-md border border-border-default bg-surface-0 px-3 py-2 text-sm text-text-primary focus:border-brand-gold/60 focus:outline-none"
        >
          <option value="all">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap items-center gap-2">
          {FRESH_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFresh(f.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
                fresh === f.key
                  ? "border-brand-gold/60 bg-brand-gold/10 text-brand-gold"
                  : "border-border-subtle bg-surface-0 text-text-secondary hover:border-brand-gold/50 hover:text-brand-gold"
              }`}
            >
              {f.tone && <span className={`h-2 w-2 rounded-full ${FRESH_DOT[f.tone]}`} />}
              {f.label}
              <span className="text-text-muted">{freshCounts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-sm text-text-muted">{view.length} shown</p>

      <div className="overflow-hidden rounded-xl border border-border-subtle">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-1 text-xs uppercase tracking-[0.06em] text-text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">
                <button
                  type="button"
                  onClick={() => toggleSort("name")}
                  className="inline-flex items-center gap-1 hover:text-brand-gold"
                >
                  Venue <SortIcon k="name" />
                </button>
              </th>
              <th className="px-4 py-3 font-semibold">
                <button
                  type="button"
                  onClick={() => toggleSort("country")}
                  className="inline-flex items-center gap-1 hover:text-brand-gold"
                >
                  Country <SortIcon k="country" />
                </button>
              </th>
              <th className="px-4 py-3 font-semibold">Type / Style</th>
              <th className="px-4 py-3 font-semibold">Gaps</th>
              <th className="px-4 py-3 font-semibold">
                <button
                  type="button"
                  onClick={() => toggleSort("enriched")}
                  className="inline-flex items-center gap-1 hover:text-brand-gold"
                >
                  Last enriched <SortIcon k="enriched" />
                </button>
              </th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const g = gaps(r);
              const f = freshness(r.enriched_at);
              return (
                <tr key={r.id} className="border-t border-border-subtle bg-surface-0 align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-text-primary">{r.name}</div>
                    <div className="text-xs text-text-muted">
                      {r.city}
                      {r.status !== "approved" && (
                        <span className="ml-2 rounded-full bg-brand-sienna/15 px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase text-brand-sienna-light">
                          {r.status}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{r.country}</td>
                  <td className="px-4 py-3 text-xs text-text-secondary">
                    {r.category && r.category !== "restaurant"
                      ? CATEGORY_LABELS[r.category as MapItemCategory]
                      : STYLE_LABELS[r.style as BbqStyle] ?? r.style}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {g.length === 0 ? (
                      <span className="text-emerald-400">complete</span>
                    ) : (
                      <span className="text-brand-sienna-light">{g.join(", ")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${FRESH_TONE_CLASSES[f.tone]}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${FRESH_DOT[f.tone]}`} />
                      {f.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/restaurants/${r.slug}`}
                        className="text-text-muted transition-colors hover:text-brand-gold"
                        title="View listing"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/admin/enrich?slug=${r.slug}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Enrich
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
