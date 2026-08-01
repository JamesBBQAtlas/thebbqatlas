"use client";

import { useMemo, useState } from "react";
import { Search, Download, ChevronDown, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type MemberCounts = {
  saves: number;
  checkins: number;
  bookmarks: number;
  reviews: number;
  follows: number;
};

export type MemberRow = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  account_type: string | null;
  joined: string | null;
  lastActive: string | null;
  marketingOptIn: boolean;
  marketingOptInAt: string | null;
  provider: string | null;
  counts: MemberCounts;
};

export type MemberTiles = {
  total: number;
  withSaves: number;
  newThisWeek: number;
  optInPct: number;
};

type MemberDetail = {
  savedSpots: { name: string | null; slug: string | null; date: string }[];
  checkIns: {
    name: string | null;
    slug: string | null;
    note: string | null;
    visibility: string | null;
    date: string;
  }[];
  bookmarks: { title: string | null; slug: string | null; date: string }[];
  reviews: {
    name: string | null;
    slug: string | null;
    rating: number;
    body: string | null;
    status: string | null;
    date: string;
  }[];
  follows: { followingId: string; date: string }[];
  meta: {
    id: string;
    provider: string | null;
    stripe_customer_id: string | null;
    unsubscribe_token: boolean;
    welcome_email_sent: boolean;
    day3_email_sent: boolean;
    marketing_opt_in: boolean;
    marketing_opt_in_at: string | null;
  };
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "default" | "green" | "amber" | "red" | "gold";
}) {
  const color =
    tone === "green"
      ? "text-emerald-400"
      : tone === "amber"
        ? "text-amber-400"
        : tone === "red"
          ? "text-red-400"
          : tone === "gold"
            ? "text-brand-gold"
            : "text-text-primary";
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
      <div className={`font-heading text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-sm text-text-secondary">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

function totalActivity(c: MemberCounts): number {
  return c.saves + c.checkins + c.bookmarks + c.reviews + c.follows;
}

/** RFC-4180-style CSV escaping. */
function csvCell(value: string | number | boolean): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

type SortKey = "joined" | "activity";

export function MembersConsole({
  members,
  tiles,
}: {
  members: MemberRow[];
  tiles: MemberTiles;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("joined");
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, MemberDetail>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? members.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            (m.email ?? "").toLowerCase().includes(q)
        )
      : members.slice();
    filtered.sort((a, b) => {
      if (sort === "activity") {
        return totalActivity(b.counts) - totalActivity(a.counts);
      }
      const ta = a.joined ? new Date(a.joined).getTime() : 0;
      const tb = b.joined ? new Date(b.joined).getTime() : 0;
      return tb - ta;
    });
    return filtered;
  }, [members, query, sort]);

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (details[id]) return;
    setLoadingId(id);
    setErrorId(null);
    try {
      const res = await fetch(`/api/admin/members?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data: MemberDetail = await res.json();
      setDetails((prev) => ({ ...prev, [id]: data }));
    } catch {
      setErrorId(id);
    } finally {
      setLoadingId(null);
    }
  }

  function exportCsv() {
    const header = [
      "Name",
      "Email",
      "Role",
      "Account type",
      "Joined",
      "Last active",
      "Marketing opt-in",
      "Saves",
      "Check-ins",
      "Bookmarks",
      "Reviews",
      "Follows",
    ];
    const lines = [header.map(csvCell).join(",")];
    for (const m of shown) {
      lines.push(
        [
          m.name,
          m.email ?? "",
          m.role,
          m.account_type ?? "",
          fmtDate(m.joined),
          m.lastActive ? fmtDate(m.lastActive) : "never",
          m.marketingOptIn ? "yes" : "no",
          m.counts.saves,
          m.counts.checkins,
          m.counts.bookmarks,
          m.counts.reviews,
          m.counts.follows,
        ]
          .map(csvCell)
          .join(",")
      );
    }
    const csv = lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `members-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Tiles */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total members" value={tiles.total} tone="gold" />
        <Stat label="With ≥1 save" value={tiles.withSaves} tone="green" />
        <Stat label="New this week" value={tiles.newThisWeek} tone="amber" />
        <Stat label="Marketing opt-in" value={`${tiles.optInPct}%`} />
      </div>

      {/* Controls */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="w-full rounded-lg border border-border-subtle bg-surface-0 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold focus:outline-none"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary focus:border-brand-gold focus:outline-none"
        >
          <option value="joined">Sort: Joined (newest)</option>
          <option value="activity">Sort: Most active</option>
        </select>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-default px-3.5 py-2 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-gold hover:text-brand-gold"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <p className="mt-3 text-xs text-text-muted">
        Showing {shown.length} of {members.length} members.
      </p>

      {/* Table */}
      <div className="mt-3 overflow-x-auto rounded-xl border border-border-subtle bg-surface-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-[0.06em] text-text-muted">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role · Type</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
              <th className="px-4 py-3 font-semibold">Last active</th>
              <th className="px-4 py-3 text-center font-semibold" title="Marketing opt-in">
                Opt-in
              </th>
              <th className="px-4 py-3 text-center font-semibold">Saves</th>
              <th className="px-4 py-3 text-center font-semibold">Check-ins</th>
              <th className="px-4 py-3 text-center font-semibold">Bookmarks</th>
              <th className="px-4 py-3 text-center font-semibold">Reviews</th>
              <th className="px-4 py-3 text-center font-semibold">Follows</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-text-muted">
                  No members match your search.
                </td>
              </tr>
            )}
            {shown.map((m) => (
              <MemberRowView
                key={m.id}
                member={m}
                open={openId === m.id}
                detail={details[m.id]}
                loading={loadingId === m.id}
                error={errorId === m.id}
                onToggle={() => toggle(m.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemberRowView({
  member: m,
  open,
  detail,
  loading,
  error,
  onToggle,
}: {
  member: MemberRow;
  open: boolean;
  detail: MemberDetail | undefined;
  loading: boolean;
  error: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          "cursor-pointer border-b border-border-subtle transition-colors hover:bg-surface-1",
          open && "bg-surface-1"
        )}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            )}
            <span className="font-semibold text-text-primary">{m.name}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-text-secondary">{m.email ?? "—"}</td>
        <td className="px-4 py-3 text-text-secondary">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              m.role === "admin"
                ? "bg-brand-gold/15 text-brand-gold"
                : "bg-surface-2 text-text-muted"
            )}
          >
            {m.role}
          </span>
          {m.account_type && (
            <span className="ml-1.5 text-xs text-text-muted">{m.account_type}</span>
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
          {fmtDate(m.joined)}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
          {m.lastActive ? fmtDate(m.lastActive) : "never"}
        </td>
        <td className="px-4 py-3 text-center">
          {m.marketingOptIn ? (
            <span
              className="inline-flex text-emerald-400"
              title={
                m.marketingOptInAt
                  ? `Opted in ${fmtDate(m.marketingOptInAt)}`
                  : "Opted in"
              }
            >
              <Check className="h-4 w-4" />
            </span>
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-center text-text-secondary">{m.counts.saves}</td>
        <td className="px-4 py-3 text-center text-text-secondary">{m.counts.checkins}</td>
        <td className="px-4 py-3 text-center text-text-secondary">{m.counts.bookmarks}</td>
        <td className="px-4 py-3 text-center text-text-secondary">{m.counts.reviews}</td>
        <td className="px-4 py-3 text-center text-text-secondary">{m.counts.follows}</td>
      </tr>
      {open && (
        <tr className="border-b border-border-subtle bg-surface-1">
          <td colSpan={11} className="px-4 py-5">
            {loading && <p className="text-sm text-text-muted">Loading activity…</p>}
            {error && (
              <p className="text-sm text-destructive">
                Couldn&apos;t load this member&apos;s activity. Try again.
              </p>
            )}
            {!loading && !error && detail && <MemberDetailView detail={detail} />}
          </td>
        </tr>
      )}
    </>
  );
}

function DetailSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-0 p-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
        {title} <span className="text-text-secondary">· {count}</span>
      </h4>
      {count === 0 ? (
        <p className="text-sm text-text-muted">None.</p>
      ) : (
        <div className="space-y-1.5 text-sm">{children}</div>
      )}
    </div>
  );
}

function VenueLink({ name, slug }: { name: string | null; slug: string | null }) {
  if (slug) {
    return (
      <a
        href={`/restaurants/${slug}`}
        target="_blank"
        rel="noreferrer"
        className="font-semibold text-brand-gold hover:underline"
      >
        {name ?? "Venue"}
      </a>
    );
  }
  return <span className="font-semibold text-text-primary">{name ?? "Venue"}</span>;
}

function MemberDetailView({ detail }: { detail: MemberDetail }) {
  const { meta } = detail;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <DetailSection title="Saved spots" count={detail.savedSpots.length}>
        {detail.savedSpots.map((s, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <VenueLink name={s.name} slug={s.slug} />
            <span className="whitespace-nowrap text-xs text-text-muted">
              {fmtDate(s.date)}
            </span>
          </div>
        ))}
      </DetailSection>

      <DetailSection title="Check-ins" count={detail.checkIns.length}>
        {detail.checkIns.map((c, i) => (
          <div key={i} className="border-b border-border-subtle/60 pb-1.5 last:border-0">
            <div className="flex items-baseline justify-between gap-3">
              <VenueLink name={c.name} slug={c.slug} />
              <span className="whitespace-nowrap text-xs text-text-muted">
                {c.visibility ? `${c.visibility} · ` : ""}
                {fmtDate(c.date)}
              </span>
            </div>
            {c.note && <p className="mt-0.5 text-text-secondary">{c.note}</p>}
          </div>
        ))}
      </DetailSection>

      <DetailSection title="Bookmarks" count={detail.bookmarks.length}>
        {detail.bookmarks.map((b, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <span className="font-semibold text-text-primary">{b.title ?? "—"}</span>
            <span className="whitespace-nowrap text-xs text-text-muted">
              {fmtDate(b.date)}
            </span>
          </div>
        ))}
      </DetailSection>

      <DetailSection title="Reviews" count={detail.reviews.length}>
        {detail.reviews.map((r, i) => (
          <div key={i} className="border-b border-border-subtle/60 pb-1.5 last:border-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-2">
                <VenueLink name={r.name} slug={r.slug} />
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-brand-gold">
                  {r.rating}/5
                </span>
                {r.status && (
                  <span className="text-xs text-text-muted">{r.status}</span>
                )}
              </span>
              <span className="whitespace-nowrap text-xs text-text-muted">
                {fmtDate(r.date)}
              </span>
            </div>
            {r.body && <p className="mt-0.5 text-text-secondary">{r.body}</p>}
          </div>
        ))}
      </DetailSection>

      <DetailSection title="Follows" count={detail.follows.length}>
        {detail.follows.map((f, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-xs text-text-secondary">{f.followingId}</span>
            <span className="whitespace-nowrap text-xs text-text-muted">
              {fmtDate(f.date)}
            </span>
          </div>
        ))}
      </DetailSection>

      {/* Account meta */}
      <div className="rounded-lg border border-border-subtle bg-surface-0 p-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
          Account
        </h4>
        <dl className="space-y-1 text-sm">
          <MetaRow label="ID" value={<span className="font-mono text-xs">{meta.id}</span>} />
          <MetaRow label="Provider" value={meta.provider ?? "—"} />
          <MetaRow label="Stripe customer" value={meta.stripe_customer_id ?? "—"} />
          <MetaRow label="Unsubscribe token" value={meta.unsubscribe_token ? "present" : "—"} />
          <MetaRow label="Welcome email" value={meta.welcome_email_sent ? "sent" : "—"} />
          <MetaRow label="Day-3 email" value={meta.day3_email_sent ? "sent" : "—"} />
          <MetaRow
            label="Marketing opt-in"
            value={
              meta.marketing_opt_in
                ? `yes${meta.marketing_opt_in_at ? ` · ${fmtDate(meta.marketing_opt_in_at)}` : ""}`
                : "no"
            }
          />
        </dl>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-text-secondary">{value}</dd>
    </div>
  );
}
