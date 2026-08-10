"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles,
  PenLine,
  Instagram,
  Check,
  Loader2,
  Pause,
  Play,
  Square,
  AlertTriangle,
  ImageIcon,
  Eye,
  X,
  Store,
  Crown,
  MapPin,
  Star,
  Trash2,
  Unlink,
  Link2,
  SquarePen,
  Ban,
  RefreshCw,
  Archive,
  Youtube,
  Lock,
  ShieldCheck,
  MapPinOff,
} from "lucide-react";
import { freshness, FRESH_DOT } from "@/lib/admin/freshness";
import { compareVenues, SORT_KEYS, type SortKey, type SortDir } from "@/lib/admin/venue-sort";
import {
  ITEM_CATEGORY_LABELS,
  ITEM_CATEGORY_OPTIONS,
  isDineInCategory,
  type ItemCategory,
} from "@/lib/constants/item-categories";
import { estimateCost, fmtUsd, BATCH_CONFIRM_THRESHOLD, COST_PER_VENUE_CEILING } from "@/lib/constants/enrichment-cost";
import { PinMap } from "@/components/admin/PinMap";
import { HoursEditor } from "@/components/admin/HoursEditor";

/**
 * geocode-fix — classify a venue's pin so the operator sees at a glance which
 * pins are trustworthy. Confirmed = hand-locked or a validated address/POI pin;
 * Approximate = a postcode-area / low-confidence pin to verify; Missing = no pin.
 */
type PinConfidence = "confirmed" | "approximate" | "missing";
function pinConfidence(v: {
  lat?: number | null;
  lng?: number | null;
  geoLocked?: boolean;
  geoPrecision?: string | null;
  geoConfidence?: number | null;
}): PinConfidence {
  const la = v.lat, ln = v.lng;
  const hasPin =
    typeof la === "number" && typeof ln === "number" &&
    Number.isFinite(la) && Number.isFinite(ln) && !(la === 0 && ln === 0);
  if (!hasPin) return "missing";
  if (v.geoLocked) return "confirmed";
  const precise = ["poi", "address", "street", "manual"].includes(String(v.geoPrecision ?? ""));
  const conf = typeof v.geoConfidence === "number" ? v.geoConfidence : null;
  // A validated precise pin (or, for legacy rows with no stored quality, an
  // existing pin we can't fault) reads Confirmed; a postcode/place-level or
  // low-confidence pin reads Approximate.
  if (precise && (conf === null || conf >= 0.9)) return "confirmed";
  if (v.geoPrecision == null && conf == null) return "confirmed"; // legacy pin, unknown provenance
  return "approximate";
}

export interface HubVenue {
  id: string;
  name: string;
  location_label: string | null;
  city: string | null;
  country: string | null;
  status: string;
  style: string;
  styleLabel: string;
  category: string | null;
  manualCategory: boolean;
  enriched_at: string | null;
  needs_attention: boolean;
  attention_reason: string | null;
  hasRealPhoto: boolean;
  heroUrl: string; // resolved (real or style default)
  heroSourceLabel: string;
  hasIG: boolean;
  postsCount: number;
  hasPending: boolean;
  pending: Record<string, unknown> | null; // proposed change set (live venues)
  fields: Record<string, unknown>; // current values, for the diff
  hook: string | null;
  description: string | null;
  cost: number;
  lastRunCost: number;
  chainSeed: boolean;
  chainParentId: string | null;
  isChainParent: boolean;
  chainRostered: boolean;
  flagshipUnset: boolean;
  chainCandidate: boolean;
  isFeatured: boolean;
  permanentlyClosed: boolean;
  manualCopy: boolean;
  lat: number;
  lng: number;
  // geocode-fix — pin quality for the Confirmed / Approximate / Missing indicator.
  geoPrecision?: string | null;
  geoConfidence?: number | null;
  geoLocked?: boolean;
  geoSource?: string | null;
  // Part 5 — full provenance for admins (privileged view; PII allowed here only).
  provenance?: VenueProvenance | null;
}

/** Admin-only provenance for a venue. `submission` carries submitter PII and
 *  must NEVER be sent to a public/anon surface — it's for the admin console. */
export interface VenueProvenance {
  source: "member" | "bulk";
  addedAt: string | null;
  updatedActor: string | null;
  updatedAt: string | null;
  submission: {
    email: string | null;
    ip: string | null;
    country: string | null;
    status: string | null;
    submittedAt: string | null;
  } | null;
}

/** A chain flagship's published summary — for a child's "Flagship Set" badge +
 *  on-demand popup, so its (usually already-approved) parent's state and content
 *  are visible from the Pending screen. */
export interface FlagshipSummary {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  styleLabel: string;
  enriched: boolean; // enriched_at IS NOT NULL
  hook: string | null;
  description: string | null;
}

type ActionKind = "enrich" | "rewrite" | "ops" | "findig" | "publish" | "reject" | "park";
type RunState = "idle" | "queued" | "running" | "done" | "attention" | "error";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// What the Preview pop-up is showing, and therefore which decision it offers.
//  pending_copy → proposed copy for a LIVE venue: Approve / Discard
//  draft        → a pending venue's copy: Publish / Reject
//  live         → the current published copy (read-only)
type PreviewMode = "pending_copy" | "draft" | "live";
// Store just the id + mode; the modal reads the CURRENT row so it reflects
// changes applied after the last refresh.
interface PreviewData {
  venueId: string;
  mode: PreviewMode;
}

// Structured fields shown in the full-change diff (§09.3).
const DIFF_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "location_label", label: "Location label" },
  { key: "address", label: "Address" },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website" },
  { key: "instagram_handle", label: "Instagram" },
  { key: "style", label: "BBQ style" },
  { key: "price_level", label: "Price" },
  { key: "hours", label: "Hours" },
  { key: "x_url", label: "X" },
  { key: "facebook_url", label: "Facebook" },
  { key: "tiktok_url", label: "TikTok" },
  { key: "youtube_url", label: "YouTube" },
  { key: "city", label: "City" },
  { key: "permanently_closed", label: "Status" },
];

function fmtVal(key: string, val: unknown): string {
  if (key === "permanently_closed") return val ? "Permanently closed" : "—";
  if (val === null || val === undefined || val === "") return "—";
  if (key === "price_level") return "$".repeat(Math.max(1, Math.min(4, Number(val) || 1)));
  if (key === "hours" && typeof val === "object") {
    return Object.entries(val as Record<string, string>)
      .map(([d, h]) => `${d}: ${h}`)
      .join(", ") || "—";
  }
  return String(val);
}

const ACTIONS: { kind: ActionKind; label: string; icon: typeof Sparkles }[] = [
  { kind: "enrich", label: "Enrich", icon: Sparkles },
  { kind: "rewrite", label: "Rewrite", icon: PenLine },
  { kind: "ops", label: "Update details", icon: RefreshCw },
  { kind: "findig", label: "Find IG", icon: Instagram },
  { kind: "publish", label: "Publish", icon: Check },
  { kind: "reject", label: "Reject", icon: X },
];

// The slim floating bar carries only the research actions — the ones you reach
// for while scanning a long list. Publish/Reject stay in the top bar.
const FLOAT_ACTIONS = ACTIONS.filter(
  (a) => a.kind === "enrich" || a.kind === "rewrite" || a.kind === "ops" || a.kind === "findig"
);

// Enrichment (Grok research + Claude write) is genuinely slow — up to a couple
// of minutes — so give it a generous client timeout that still recovers a hung
// request instead of spinning "Working…" forever.
async function fetchWithTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callAction(id: string, kind: ActionKind, extra?: Record<string, unknown>): Promise<Response> {
  if (kind === "publish" || kind === "reject" || kind === "park") {
    return fetch("/api/admin/venues", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId: id,
        status: kind === "publish" ? "approved" : kind === "park" ? "parked" : "rejected",
        ...extra,
      }),
    });
  }
  if (kind === "rewrite") {
    return fetchWithTimeout(
      "/api/admin/venues/rewrite",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId: id, ...extra }) },
      240_000
    );
  }
  if (kind === "ops") {
    return fetchWithTimeout(
      "/api/admin/venues/ops-refresh",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId: id, ...extra }) },
      240_000
    );
  }
  return fetchWithTimeout(
    "/api/admin/venues/enrich-draft",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: id, mode: kind === "findig" ? "light" : "full", ...extra }),
    },
    240_000
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number | string; tone?: string }) {
  const color =
    tone === "amber" ? "text-amber-400" : tone === "gold" ? "text-brand-gold" : tone === "green" ? "text-emerald-400" : "text-text-primary";
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
      <div className={`font-heading text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs text-text-secondary">{label}</div>
    </div>
  );
}

export function VenueHub({
  venues,
  styleOptions,
  initialStatus = "all",
  initialFilters,
  flagships,
}: {
  venues: HubVenue[];
  styleOptions: { slug: string; label: string }[];
  initialStatus?: string;
  /** Deep-link filters from the dashboard tiles (e.g. ?fresh=red). */
  initialFilters?: { fresh?: string; attn?: boolean; closed?: boolean; flagship?: boolean };
  /** Published summaries of the flagships of any chain CHILDREN in this list —
   *  so a child can resolve its (often already-approved, out-of-list) parent's
   *  enriched state + show it on demand without leaving Pending. */
  flagships?: FlagshipSummary[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState(initialStatus);
  // Part A — re-enrich builds ON the venue's current details & copy (default ON).
  const [useExisting, setUseExisting] = useState(true);
  const [country, setCountry] = useState("all");
  const [photoF, setPhotoF] = useState("all"); // all | yes | no
  const [igF, setIgF] = useState("all");
  // Freshness / status filters (Part C) — the staleness workflow.
  const [freshF, setFreshF] = useState(initialFilters?.fresh ?? "all"); // all | green | amber | red
  const [attnF, setAttnF] = useState(Boolean(initialFilters?.attn)); // needs_attention
  const [closedF, setClosedF] = useState(Boolean(initialFilters?.closed)); // permanently_closed
  const [flagshipF, setFlagshipF] = useState(Boolean(initialFilters?.flagship)); // flagship_unset
  // Column sort — default ENRICHED newest-first; initialised from the URL so a
  // refresh keeps it (?sort=enriched&dir=desc). Sorts the WHOLE filtered set.
  const searchParams = useSearchParams();
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const s = searchParams.get("sort");
    return (s && (SORT_KEYS as string[]).includes(s) ? s : "enriched") as SortKey;
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    const d = searchParams.get("dir");
    return d === "asc" || d === "desc" ? d : "desc";
  });
  // First click on a column sorts ascending; clicking the active column flips it.
  const setSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };
  const sortCaret = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : "↕");
  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      type="button"
      onClick={() => setSort(k)}
      className={`inline-flex items-center gap-1 ${sortKey === k ? "text-brand-gold" : "hover:text-brand-gold"}`}
      title={`Sort by ${label}${sortKey === k ? ` (${sortDir})` : ""}`}
    >
      {label}
      <span className={`text-[0.625rem] ${sortKey === k ? "" : "text-text-muted/50"}`}>{sortCaret(k)}</span>
    </button>
  );
  const [status, setStatus] = useState<Record<string, { state: RunState; msg?: string }>>({});
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ done: 0, attention: 0, skipped: 0, total: 0, kind: "" as string });
  const [heroOpen, setHeroOpen] = useState<string | null>(null);
  const [locOpen, setLocOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [rowResult, setRowResult] = useState<Record<string, { msg?: string; err?: string; warn?: string }>>({});
  const [confirmBatch, setConfirmBatch] = useState<{ kind: ActionKind; n: number; est: number } | null>(null);
  // §09.1.2b — chain roster gateway surfaced after a parent enrich detects a chain.
  const [chainGateway, setChainGateway] = useState<{
    venueId: string;
    brand: string;
    chainLocationsUrl: string | null;
    seeded: { label: string; city: string | null }[];
    scanning: boolean;
    rostered: boolean;
    result: string | null;
  } | null>(null);
  const pauseRef = useRef(false);
  const stopRef = useRef(false);
  // Hold the scroll position across a router.refresh() re-render so an enrich
  // doesn't jump the list away from the venue you just acted on.
  const restoreScrollRef = useRef<number | null>(null);
  const keepScroll = () => {
    if (typeof window !== "undefined") restoreScrollRef.current = window.scrollY;
  };
  // The venue we just acted on. After the refresh it can RE-SORT to a new spot,
  // so raw scroll-restore leaves you looking at an unrelated row — instead we
  // anchor to this venue (and its sibling group) and flash it briefly.
  const actedRef = useRef<string | null>(null);
  const markActed = (id: string) => {
    actedRef.current = id;
  };
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // After the venues list re-renders: if we just acted on a venue, scroll IT
  // back into view (it may have RE-SORTED — often to the very top when a chain
  // group jumps up) and flash it; otherwise just restore the raw scroll position.
  useEffect(() => {
    const acted = actedRef.current;
    const savedY = restoreScrollRef.current;
    if (acted) {
      actedRef.current = null;
      restoreScrollRef.current = null;
      // The re-sorted row (and any freshly-inserted sibling group) may not be in
      // the DOM on the first frame, and a competing layout shift can cancel a
      // smooth scroll — so retry across a few frames and jump INSTANTLY wherever
      // the row landed, top included.
      let tries = 0;
      const anchor = () => {
        const el = rowRefs.current.get(acted);
        if (el) {
          // "nearest" scrolls the minimum needed — if the row is already visible
          // (the common case now that order is stable), the viewport does NOT move.
          el.scrollIntoView({ block: "nearest", behavior: "auto" });
          setHighlightId(acted);
          window.setTimeout(() => setHighlightId((cur) => (cur === acted ? null : cur)), 2200);
        } else if (tries < 10) {
          tries++;
          window.setTimeout(anchor, 50);
        } else if (savedY != null) {
          window.scrollTo({ top: savedY });
        }
      };
      requestAnimationFrame(anchor);
      return;
    }
    if (savedY != null) {
      restoreScrollRef.current = null;
      requestAnimationFrame(() => window.scrollTo({ top: savedY }));
    }
  }, [venues]);

  const countries = useMemo(
    () => [...new Set(venues.map((v) => v.country).filter(Boolean) as string[])].sort(),
    [venues]
  );

  const venueById = useMemo(() => new Map(venues.map((v) => [v.id, v])), [venues]);
  // Flagship summaries supplied by the server (a child's flagship is usually
  // already APPROVED and thus NOT in this pending list — the old lookup against
  // the in-list venues returned undefined and wrongly reported "flagship not
  // enriched"). This map is the authoritative source for a child's parent state.
  const flagshipById = useMemo(
    () => new Map((flagships ?? []).map((f) => [f.id, f])),
    [flagships]
  );
  const [flagshipPopup, setFlagshipPopup] = useState<FlagshipSummary | null>(null);
  // Is a chain child's flagship enriched? Resolve the PARENT via chain_parent_id
  // and test the PARENT's enriched state — never the child's own enriched_at
  // (still NULL pre-enrichment, which is the normal state). Prefer the server-
  // provided flagship summary; fall back to an in-list parent if present.
  const parentReady = (v: HubVenue): boolean => {
    if (!v.chainSeed || !v.chainParentId) return true;
    const f = flagshipById.get(v.chainParentId);
    if (f) return f.enriched;
    const p = venueById.get(v.chainParentId);
    return Boolean(p && p.enriched_at && !p.needs_attention);
  };
  const PARENT_FIRST_MSG = "Enrich the flagship first — this location inherits its brand facts.";

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = venues.filter((v) => {
      if (statusF !== "all" && v.status !== statusF) return false;
      if (country !== "all" && v.country !== country) return false;
      if (photoF === "yes" && !v.hasRealPhoto) return false;
      if (photoF === "no" && v.hasRealPhoto) return false;
      if (igF === "yes" && !v.hasIG) return false;
      if (igF === "no" && v.hasIG) return false;
      if (freshF !== "all" && freshness(v.enriched_at).tone !== freshF) return false;
      if (attnF && !v.needs_attention) return false;
      if (closedF && !v.permanentlyClosed) return false;
      if (flagshipF && !v.flagshipUnset) return false;
      if (needle && !`${v.name} ${v.city ?? ""} ${v.country ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    // Sorting is applied at the UNIT level (below), so chain groups stay intact.
    return list;
  }, [venues, q, statusF, country, photoF, igF, freshF, attnF, closedF, flagshipF]);

  // Group a chain's sibling seeds directly beneath their parent so a detected
  // chain reads as one block ("parent + its N seeds"), not scattered rows.
  //
  // STABILITY (Fix 3): the list order is the underlying created_at order, and a
  // group is ANCHORED at the EARLIEST original position among its members. So a
  // status change never re-sorts a row, and when a brand-new (late-created)
  // flagship parent appears after a branch-first enrich, the group stays put at
  // the branch's original spot instead of jumping to the bottom. New siblings
  // insert beneath the parent, in place.
  // Group into UNITS: one top-level row (flagship / standalone / orphan seed)
  // plus any chain children that ride along beneath it. Pagination counts UNITS,
  // so a flagship and its children are never split across a page boundary.
  const units = useMemo(() => {
    const pos = new Map(shown.map((v, i) => [v.id, i]));
    const shownIds = new Set(shown.map((v) => v.id));
    const seedsByParent = new Map<string, HubVenue[]>();
    const topLevel: HubVenue[] = [];
    for (const v of shown) {
      if (v.chainSeed && v.chainParentId && shownIds.has(v.chainParentId)) {
        const arr = seedsByParent.get(v.chainParentId) ?? [];
        arr.push(v);
        seedsByParent.set(v.chainParentId, arr);
      } else {
        // Parents, standalones, and orphan seeds (whose parent isn't shown).
        topLevel.push(v);
      }
    }
    const anchor = (v: HubVenue) => {
      let a = pos.get(v.id) ?? 0;
      const kids = seedsByParent.get(v.id);
      if (kids) for (const k of kids) a = Math.min(a, pos.get(k.id) ?? a);
      return a;
    };
    const out: { v: HubVenue; indent: boolean }[][] = [];
    for (const v of [...topLevel].sort((x, y) => anchor(x) - anchor(y))) {
      const unit: { v: HubVenue; indent: boolean }[] = [
        { v, indent: v.chainSeed && Boolean(v.chainParentId) },
      ];
      const kids = seedsByParent.get(v.id);
      if (kids) {
        kids.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
        for (const k of kids) unit.push({ v: k, indent: true });
      }
      out.push(unit);
    }
    return out;
  }, [shown]);

  // Sort the whole filtered set at the UNIT level (by each unit's top-level /
  // flagship venue), so the order is correct across ALL pages — then paginate.
  // Chain children stay grouped under their parent.
  const sortedUnits = useMemo(() => {
    return [...units].sort((ua, ub) => compareVenues(ua[0].v, ub[0].v, sortKey, sortDir));
  }, [units, sortKey, sortDir]);

  // Client-side pagination — 50 top-level units per page. Search/filter/sort all
  // operate over the WHOLE catalogue above; only the rendered slice is capped, so
  // the DOM stays small as the catalogue grows.
  const PAGE_SIZE = 50;
  // "Show all" escape hatch — render every filtered unit on one page so a large
  // chain (or the whole catalogue) is fully browsable without paging.
  const effSize = showAll ? Math.max(sortedUnits.length, 1) : PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(sortedUnits.length / effSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  // Snap back to page 1 whenever the filtered/sorted set changes, so you're never
  // stranded on an out-of-range page after narrowing the results.
  useEffect(() => {
    setPage(1);
  }, [q, statusF, country, photoF, igF, freshF, attnF, closedF, flagshipF, sortKey, sortDir]);
  // Clamp if the current page fell past the end (e.g. rows removed).
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  // Reflect the active sort in the URL (so a refresh keeps it); default
  // (enriched desc) drops the params for a clean URL. replaceState avoids a
  // server round-trip / refetch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (sortKey === "enriched" && sortDir === "desc") { params.delete("sort"); params.delete("dir"); }
    else { params.set("sort", sortKey); params.set("dir", sortDir); }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [sortKey, sortDir]);

  const pageUnits = sortedUnits.slice((safePage - 1) * effSize, safePage * effSize);
  const grouped = pageUnits.flat();
  const pageIds = grouped.map((r) => r.v.id);
  // Header select-all (Part 1 §6): reflects selection over the rendered rows,
  // with an indeterminate state when only some are picked. Toggling is additive
  // so selections on other pages / "all filtered" are preserved.
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = !allPageSelected && pageIds.some((id) => selected.has(id));
  const headerCbRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = somePageSelected;
  }, [somePageSelected, safePage, pageIds.length]);
  const togglePageSelection = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageIds.every((id) => next.has(id))) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  const topLevelCount = sortedUnits.length;
  const pageStart = topLevelCount === 0 ? 0 : (safePage - 1) * effSize + 1;
  const pageEnd = Math.min(safePage * effSize, topLevelCount);

  const metrics = useMemo(() => {
    const m = {
      total: venues.length,
      published: 0,
      drafts: 0,
      attention: 0,
      photo: 0,
      ig: 0,
      fresh30: 0,
      stale: 0,
      spend: 0,
      enrichedCount: 0,
    };
    for (const v of venues) {
      if (v.status === "approved") m.published++;
      if (v.status === "pending") m.drafts++;
      if (v.needs_attention) m.attention++;
      if (v.hasRealPhoto) m.photo++;
      if (v.hasIG) m.ig++;
      const tone = freshness(v.enriched_at).tone;
      if (tone === "green") m.fresh30++;
      if (tone === "red") m.stale++;
      if (v.cost > 0) {
        m.spend += v.cost;
        m.enrichedCount++;
      }
    }
    return m;
  }, [venues]);
  const avgCost = metrics.enrichedCount ? metrics.spend / metrics.enrichedCount : 0;

  function toggle(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  // Page-scoped by default — a mis-click can't enqueue an enrich run over the
  // whole catalogue. "Select all N filtered" is the explicit escape hatch.
  const selectPage = () => setSelected(new Set(pageIds));
  const selectAllFiltered = () => setSelected(new Set(shown.map((v) => v.id)));
  const clearSel = () => setSelected(new Set());
  const setState = (id: string, state: RunState, msg?: string) =>
    setStatus((p) => ({ ...p, [id]: { state, msg } }));

  async function runOne(id: string, kind: ActionKind): Promise<RunState> {
    setState(id, "running");
    try {
      const res = await callAction(id, kind, kind === "enrich" ? { useExisting } : undefined);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState(id, "error", data.error ?? "Failed");
        return "error";
      }
      if (data.needs_attention) {
        setState(id, "attention", data.attention_reason ?? "Needs attention");
        return "attention";
      }
      setState(id, "done");
      return "done";
    } catch {
      setState(id, "error", "Network error");
      return "error";
    }
  }

  function requestBatch(kind: ActionKind) {
    const n = shown.filter((v) => selected.has(v.id)).length;
    if (!n || running) return;
    const est = estimateCost(kind, n);
    if (est >= BATCH_CONFIRM_THRESHOLD) {
      setConfirmBatch({ kind, n, est });
      return;
    }
    doBatch(kind);
  }

  async function doBatch(kind: ActionKind) {
    setConfirmBatch(null);
    let ids = shown.filter((v) => selected.has(v.id)).map((v) => v.id);
    // 14-day cooldown: never re-enrich a venue enriched in the last fortnight —
    // it wastes spend and the copy won't have meaningfully changed.
    let skipped = 0;
    if (kind === "enrich") {
      const recent = new Set(
        shown
          .filter((v) => {
            if (!selected.has(v.id)) return false;
            const d = v.enriched_at ? (Date.now() - new Date(v.enriched_at).getTime()) / 86_400_000 : Infinity;
            return d < 14;
          })
          .map((v) => v.id)
      );
      skipped = recent.size;
      if (skipped) {
        ids = ids.filter((id) => !recent.has(id));
        recent.forEach((id) => setRowResult((p) => ({ ...p, [id]: { msg: "Skipped — enriched in the last 14 days" } })));
      }
    }
    if (!ids.length || running) {
      if (skipped && !running) setProgress({ done: 0, attention: 0, skipped, total: 0, kind });
      return;
    }
    setRunning(true);
    setPaused(false);
    pauseRef.current = false;
    stopRef.current = false;
    let done = 0;
    let attention = 0;
    setProgress({ done: 0, attention: 0, skipped, total: ids.length, kind });
    for (const id of ids) setState(id, "queued");
    for (const id of ids) {
      if (stopRef.current) break;
      while (pauseRef.current && !stopRef.current) await sleep(300);
      if (stopRef.current) break;
      const r = await runOne(id, kind);
      if (r === "done") done++;
      else if (r === "attention") attention++;
      setProgress({ done, attention, skipped, total: ids.length, kind });
    }
    setRunning(false);
    setPaused(false);
    keepScroll();
    router.refresh();
  }

  function previewFromRow(v: HubVenue): PreviewData {
    const mode: PreviewMode = v.hasPending
      ? "pending_copy"
      : v.status !== "approved"
        ? "draft"
        : "live";
    return { venueId: v.id, mode };
  }

  async function single(v: HubVenue, kind: ActionKind, extra?: Record<string, unknown>) {
    // Guard: don't spend on a sibling's enrich/rewrite while its flagship is
    // still thin/unenriched — it would inherit nothing and come back thin.
    if ((kind === "enrich" || kind === "rewrite") && !parentReady(v)) {
      markActed(v.id);
      setRowResult((p) => ({ ...p, [v.id]: { warn: PARENT_FIRST_MSG } }));
      return;
    }
    keepScroll();
    markActed(v.id);
    setRowResult((p) => ({ ...p, [v.id]: {} }));
    setState(v.id, "running");
    let res: Response;
    try {
      res = await callAction(v.id, kind, extra);
    } catch (e) {
      setState(v.id, "idle");
      const timedOut = e instanceof DOMException && e.name === "AbortError";
      setRowResult((p) => ({
        ...p,
        [v.id]: { err: timedOut ? "Timed out — the research took too long. Try again." : "Network error" },
      }));
      return;
    }
    const data = await res.json().catch(() => ({}));
    setState(v.id, "idle");
    // Fix 10 — publishing a needs_attention (thin-data) venue is blocked; offer an
    // explicit override so filler never goes live silently.
    if (kind === "publish" && res.status === 422 && data.needs_override) {
      const ok = typeof window !== "undefined" && window.confirm(`${data.error}\n\nThis venue is flagged for attention. Publish it anyway?`);
      if (ok) return single(v, "publish", { override: true });
      setRowResult((p) => ({ ...p, [v.id]: { warn: "Publish held — flagged for attention. Fix or remove it." } }));
      return;
    }
    if (!res.ok) {
      setRowResult((p) => ({ ...p, [v.id]: { err: data.error ?? "Failed" } }));
      return;
    }
    if (kind === "findig") {
      // Report EXACTLY what was saved (Fix 2): only claim "Instagram" when a
      // handle/URL was actually persisted; a true empty says so plainly. No post
      // COUNT — a saved handle with 0 stored posts is not an empty account (we
      // don't mirror feeds), so a "0 posts" suffix reads as dead when it isn't.
      const result = data.saved_ig
        ? { msg: `Instagram saved${data.handle ? ` · @${data.handle}` : ""}` }
        : { warn: "No Instagram found" };
      setRowResult((p) => ({ ...p, [v.id]: result }));
      router.refresh();
      return;
    }
    if (kind === "publish") {
      // Approving a flagship that has children still in Pending: reassure that it
      // moved to Listings and the branches remain to be worked here.
      const branches = venues.filter((c) => c.chainParentId === v.id).length;
      setRowResult((p) => ({
        ...p,
        [v.id]: {
          msg:
            branches > 0
              ? `Flagship approved → moved to Listings. ${branches} branch${branches === 1 ? "" : "es"} remain in Pending.`
              : "Published ✓",
        },
      }));
      router.refresh();
      return;
    }
    if (kind === "reject") {
      setRowResult((p) => ({ ...p, [v.id]: { msg: v.status === "approved" ? "Unpublished" : "Declined" } }));
      router.refresh();
      return;
    }
    if (kind === "park") {
      setRowResult((p) => ({ ...p, [v.id]: { msg: "Parked — moved to the Parked list" } }));
      router.refresh();
      return;
    }
    if (kind === "ops") {
      // Operational-only refresh: no copy, no preview — just report what moved.
      // A closure/move is STAGED (not live): the row shows Review diff / Approve.
      const opsCost = typeof data.cost === "number" ? ` · ${fmtUsd(data.cost)}` : "";
      const n = Number(data.updated_count ?? 0);
      const liveNote = n ? `Details updated · ${n} field${n === 1 ? "" : "s"} changed` : "Details checked · already current";
      if (data.staged) {
        setRowResult((p) => ({
          ...p,
          [v.id]: { warn: `${data.attention_reason ?? "A change needs review"} → Review diff / Approve below.${opsCost}` },
        }));
      } else if (data.needs_attention) {
        setRowResult((p) => ({
          ...p,
          [v.id]: { warn: `${liveNote} — ${data.attention_reason ?? "needs a look"}${opsCost}` },
        }));
      } else {
        setRowResult((p) => ({ ...p, [v.id]: { msg: liveNote + opsCost } }));
      }
      router.refresh();
      return;
    }
    // enrich or rewrite
    const costNote = typeof data.cost === "number" ? ` · ${fmtUsd(data.cost)}` : "";
    // Part A — show the operator their existing details were used, and that any
    // protected hand-written copy was kept (new copy offered for review).
    const builtOnNote = Array.isArray(data.built_on) && data.built_on.length ? ` · built on ${data.built_on.join(", ")}` : "";
    const copyKeptNote = data.copy_protected ? " · kept your copy (new copy proposed for review)" : "";
    // Branch-first discovery: we enriched a branch, the true flagship was created
    // & populated with the brand facts, and this row was demoted to a clean
    // sibling. Show the helpful next-step message — no preview, no attention flag.
    // Step 1: plain single-venue enrich detected the venue LOOKS like a chain.
    // Soft note only — nothing is created or crowned; the row shows "Build roster".
    const chainNote = data.chain_candidate ? ` · looks like a chain — Build roster to add its locations` : "";

    // Dossier too thin → no copy written. Don't pop an empty Preview; show the
    // reason as an amber warning on the row (it also persists on the row after
    // refresh via needs_attention).
    if (data.needs_attention && !data.has_copy) {
      setRowResult((p) => ({
        ...p,
        [v.id]: {
          warn:
            (data.attention_reason
              ? `Needs attention — ${data.attention_reason}`
              : "Needs attention — dossier too thin, no copy written.") + costNote + chainNote,
        },
      }));
      router.refresh();
      return;
    }

    const mode: PreviewMode = data.pending ? "pending_copy" : "draft";
    setPreview({ venueId: v.id, mode });
    setRowResult((p) => ({
      ...p,
      [v.id]: {
        msg:
          (mode === "pending_copy"
            ? "Proposed changes ready — review & approve"
            : "Draft ready — review & publish") + costNote + builtOnNote + copyKeptNote + chainNote,
      },
    }));
    router.refresh();
  }

  // §09.1.2b — run the single, bounded roster scan for a detected chain.
  async function runRosterScan(venueId: string) {
    setChainGateway((g) => (g && g.venueId === venueId ? { ...g, scanning: true, result: null } : g));
    let data: {
      ok?: boolean;
      found?: number;
      added?: number;
      already_present?: number;
      summary?: string;
      seeded?: { label: string; city: string | null }[];
      cost?: number;
      error?: string;
    } = {};
    try {
      const res = await fetch("/api/admin/venues/chain-roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: venueId }),
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChainGateway((g) =>
          g && g.venueId === venueId ? { ...g, scanning: false, result: `Scan failed: ${data.error ?? "error"}` } : g
        );
        return;
      }
    } catch {
      setChainGateway((g) =>
        g && g.venueId === venueId ? { ...g, scanning: false, result: "Scan failed: network error" } : g
      );
      return;
    }
    // One honest readout (§09.2.3): N found · X new · Y already present.
    const newSeeds = Array.isArray(data.seeded) ? data.seeded : [];
    const summary =
      data.summary ??
      `${data.found ?? 0} found · ${data.added ?? newSeeds.length} new · ${data.already_present ?? 0} already present`;
    setChainGateway((g) =>
      g && g.venueId === venueId
        ? {
            ...g,
            scanning: false,
            rostered: true,
            seeded: [...g.seeded, ...newSeeds],
            result: `Roster scanned — ${summary} (${fmtUsd(data.cost ?? 0)}). The flagship was already enriched in its two-pass run; enrich each new branch when you're ready.`,
          }
        : g
    );
    // The flagship's own facts pass (pass 2) already ran server-side during the
    // enrich, so there's no auto re-enrich here — this optional scan only adds
    // any branches beyond what the first pass saw.
    markActed(venueId);
    keepScroll();
    router.refresh();
  }

  // Step 2 — Build roster: read the brand's /locations page and add every branch
  // as a seed in the "flagship not set" state. Claims nothing; nothing re-sorts.
  async function buildRoster(v: HubVenue) {
    keepScroll();
    markActed(v.id);
    // Live feedback so the operator never stares at an unchanged screen.
    setRowResult((p) => ({ ...p, [v.id]: { msg: `Scanning ${v.name} locations…` } }));
    setState(v.id, "running");
    let res: Response;
    try {
      res = await fetchWithTimeout(
        "/api/admin/venues/chain-roster",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId: v.id }) },
        290_000
      );
    } catch (e) {
      setState(v.id, "idle");
      const timedOut = e instanceof DOMException && e.name === "AbortError";
      setRowResult((p) => ({
        ...p,
        [v.id]: { err: timedOut ? "Discovery timed out — re-run to continue (progress is saved)." : "Discovery failed — try again." },
      }));
      return;
    }
    const data = await res.json().catch(() => ({}));
    setState(v.id, "idle");
    if (!res.ok) {
      setRowResult((p) => ({ ...p, [v.id]: { err: `Discovery failed — ${data.error ?? "try again"}` } }));
      return;
    }
    // Couldn't resolve the site, or no locations page found — surface the reason.
    if (data.needs_site || data.source_type === "none" || data.ok === false) {
      setRowResult((p) => ({ ...p, [v.id]: { warn: data.message ?? "Couldn't discover locations — see the venue's attention flag." } }));
      router.refresh();
      return;
    }
    if (data.not_a_chain) {
      setRowResult((p) => ({
        ...p,
        [v.id]: { msg: data.message ?? "Only one location on the official site — treated as a single venue." },
      }));
      router.refresh();
      return;
    }
    const found = data.found ?? 0;
    const added = data.added ?? 0;
    const src = data.source_note ? `${data.source_note}. ` : "";
    const part = data.partial ? " PARTIAL — re-run to continue. " : " ";
    setRowResult((p) => ({
      ...p,
      [v.id]: {
        warn: `${src}${found} location${found === 1 ? "" : "s"} (${added} new).${part}Flagship not set — pick the original with “Set as flagship”.`,
      },
    }));
    router.refresh();
  }

  // Operator clears a false-positive chain candidate without running a scan.
  async function dismissChain(v: HubVenue) {
    keepScroll();
    markActed(v.id);
    setState(v.id, "running");
    setRowResult((p) => ({ ...p, [v.id]: {} }));
    let res: Response;
    try {
      res = await fetch("/api/admin/venues/dismiss-chain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: v.id }),
      });
    } catch {
      setState(v.id, "idle");
      setRowResult((p) => ({ ...p, [v.id]: { err: "Network error" } }));
      return;
    }
    const data = await res.json().catch(() => ({}));
    setState(v.id, "idle");
    if (!res.ok) {
      setRowResult((p) => ({ ...p, [v.id]: { err: data.error ?? "Failed" } }));
      return;
    }
    setRowResult((p) => ({ ...p, [v.id]: { msg: data.message ?? "Cleared — single venue." } }));
    router.refresh();
  }

  // Step 3 — operator picks the flagship. Sets the origin + re-points siblings
  // (brand socials pre-filled as editable defaults), then enriches the flagship
  // via the trusted single-venue path so only a confirmed flagship claims origin.
  async function setFlagship(v: HubVenue) {
    keepScroll();
    markActed(v.id);
    setRowResult((p) => ({ ...p, [v.id]: {} }));
    setState(v.id, "running");
    let res: Response;
    try {
      res = await fetch("/api/admin/venues/set-flagship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: v.id }),
      });
    } catch {
      setState(v.id, "idle");
      setRowResult((p) => ({ ...p, [v.id]: { err: "Network error" } }));
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setState(v.id, "idle");
      setRowResult((p) => ({ ...p, [v.id]: { err: data.error ?? "Failed" } }));
      return;
    }
    setRowResult((p) => ({ ...p, [v.id]: { msg: data.message ?? "Flagship set ✓" } }));
    // The chosen row is now a confirmed flagship — enrich it via the trusted path.
    if (data.enrich_flagship) {
      const fv = venueById.get(String(data.flagship_id ?? v.id));
      if (fv) {
        await single(fv, "enrich", { useExisting });
        return;
      }
    }
    setState(v.id, "idle");
    router.refresh();
  }

  async function copyDecision(id: string, action: "approve" | "discard") {
    keepScroll();
    markActed(id);
    setState(id, "running");
    let res: Response;
    try {
      res = await fetch("/api/admin/venues/approve-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: id, action }),
      });
    } catch {
      setState(id, "error", "Network error");
      return;
    }
    if (res.ok) {
      // Reset the row's spinner (router.refresh alone re-fetches data but does
      // NOT clear this per-row state — that left "Working…" spinning after a
      // successful Approve/Discard until a full reload).
      setState(id, "idle");
      setRowResult((p) => ({ ...p, [id]: { msg: action === "approve" ? "Changes approved ✓" : "Changes discarded" } }));
      router.refresh();
    } else {
      setState(id, "error", "Failed");
    }
  }

  // Fix 6/7 — one-tap Featured / Permanently-closed flags.
  async function setFlag(v: HubVenue, patch: { is_featured?: boolean; permanently_closed?: boolean }) {
    keepScroll();
    markActed(v.id);
    setState(v.id, "running");
    let res: Response;
    try {
      res = await fetch("/api/admin/venues/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: v.id, ...patch }),
      });
    } catch {
      setState(v.id, "idle");
      setRowResult((p) => ({ ...p, [v.id]: { err: "Network error" } }));
      return;
    }
    const data = await res.json().catch(() => ({}));
    setState(v.id, "idle");
    if (!res.ok) {
      setRowResult((p) => ({ ...p, [v.id]: { err: data.error ?? "Failed" } }));
      return;
    }
    const note =
      "permanently_closed" in patch
        ? patch.permanently_closed
          ? "Marked permanently closed — hidden from the map, directory, Featured & count."
          : "Reopened — back on the map & directory."
        : patch.is_featured
          ? "Featured ✓ — on the homepage & directory."
          : "Unfeatured.";
    setRowResult((p) => ({ ...p, [v.id]: { msg: note } }));
    router.refresh();
  }

  // Fix 5 — delete a bogus row (with confirm), or detach / attach a chain member.
  async function deleteVenue(v: HubVenue) {
    if (typeof window !== "undefined" && !window.confirm(`Delete “${v.name}”${v.city ? ` (${v.city})` : ""}? This can't be undone. If it had a live URL it will 301 to the chain flagship.`)) return;
    keepScroll();
    setState(v.id, "running");
    let res: Response;
    try {
      res = await fetch("/api/admin/venues/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: v.id }),
      });
    } catch {
      setState(v.id, "idle");
      setRowResult((p) => ({ ...p, [v.id]: { err: "Network error" } }));
      return;
    }
    const data = await res.json().catch(() => ({}));
    setState(v.id, "idle");
    if (!res.ok) {
      setRowResult((p) => ({ ...p, [v.id]: { err: data.error ?? "Delete failed" } }));
      return;
    }
    router.refresh();
  }

  async function chainEdit(v: HubVenue, action: "attach" | "detach", parentId?: string) {
    keepScroll();
    markActed(v.id);
    setState(v.id, "running");
    let res: Response;
    try {
      res = await fetch("/api/admin/venues/chain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: v.id, action, parentId }),
      });
    } catch {
      setState(v.id, "idle");
      setRowResult((p) => ({ ...p, [v.id]: { err: "Network error" } }));
      return;
    }
    const data = await res.json().catch(() => ({}));
    setState(v.id, "idle");
    if (!res.ok) {
      setRowResult((p) => ({ ...p, [v.id]: { err: data.error ?? "Failed" } }));
      return;
    }
    setRowResult((p) => ({ ...p, [v.id]: { msg: data.message ?? "Done." } }));
    router.refresh();
  }

  // Candidate flagships to attach an orphan to: top-level venues (not siblings).
  const flagshipChoices = useMemo(
    () => venues.filter((v) => !v.chainParentId).map((v) => ({ id: v.id, name: v.name, city: v.city })),
    [venues]
  );

  const selCount = shown.filter((v) => selected.has(v.id)).length;

  return (
    <div>
      {/* Metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Metric label="Total venues" value={metrics.total} />
        <Metric label="Published" value={metrics.published} tone="green" />
        <Metric label="Awaiting approval" value={metrics.drafts} tone="gold" />
        <Metric label="Needs attention" value={metrics.attention} tone="amber" />
        <Metric label="With real photo" value={metrics.photo} />
        <Metric label="With Instagram" value={metrics.ig} />
        <Metric label="Fresh (≤1mo)" value={metrics.fresh30} tone="green" />
        <Metric label="Stale" value={metrics.stale} tone="amber" />
        <Metric label="Total spent" value={fmtUsd(metrics.spend)} tone="gold" />
        <Metric label="Avg $/venue" value={fmtUsd(avgCost)} />
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name / city / country…"
          className="w-60 rounded-md border border-border-default bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none"
        />
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded-md border border-border-default bg-surface-0 px-2 py-2 text-sm text-text-primary focus:outline-none">
          <option value="all">Any status</option>
          <option value="approved">Published</option>
          <option value="pending">Drafts</option>
          <option value="parked">Parked</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-md border border-border-default bg-surface-0 px-2 py-2 text-sm text-text-primary focus:outline-none">
          <option value="all">Any country</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={photoF} onChange={(e) => setPhotoF(e.target.value)} className="rounded-md border border-border-default bg-surface-0 px-2 py-2 text-sm text-text-primary focus:outline-none">
          <option value="all">Any photo</option>
          <option value="yes">Real photo</option>
          <option value="no">Style default</option>
        </select>
        <select value={igF} onChange={(e) => setIgF(e.target.value)} className="rounded-md border border-border-default bg-surface-0 px-2 py-2 text-sm text-text-primary focus:outline-none">
          <option value="all">Any IG</option>
          <option value="yes">Has IG</option>
          <option value="no">No IG</option>
        </select>
        <select value={freshF} onChange={(e) => setFreshF(e.target.value)} className="rounded-md border border-border-default bg-surface-0 px-2 py-2 text-sm text-text-primary focus:outline-none" title="Freshness by enrichment age">
          <option value="all">Any freshness</option>
          <option value="green">🟢 Fresh</option>
          <option value="amber">🟠 Ageing</option>
          <option value="red">🔴 Stale / never</option>
        </select>
        <button type="button" onClick={() => setAttnF((s) => !s)} className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${attnF ? "border-amber-500/60 bg-amber-500/10 text-amber-400" : "border-border-default text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"}`}>Needs attention</button>
        <button type="button" onClick={() => setClosedF((s) => !s)} className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${closedF ? "border-destructive/60 bg-destructive/10 text-destructive" : "border-border-default text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"}`}>Closed</button>
        <button type="button" onClick={() => setFlagshipF((s) => !s)} className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${flagshipF ? "border-amber-500/60 bg-amber-500/10 text-amber-400" : "border-border-default text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"}`}>Flagship unset</button>
        {/* Country sort lives here rather than on a column header (the middle
            column shows the photo state, not a country flag). Clicking toggles it. */}
        <button type="button" onClick={() => setSort("country")} className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${sortKey === "country" ? "border-brand-gold/60 bg-brand-gold/10 text-brand-gold" : "border-border-default text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"}`} title="Sort by country">Country {sortCaret("country")}</button>
        <span className="text-xs text-text-muted">
          {shown.length} match{shown.length === 1 ? "" : "es"}
          {pageCount > 1 && ` · showing ${pageStart}–${pageEnd} of ${topLevelCount}`}
        </span>
      </div>

      {/* Batch bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-border-subtle bg-surface-0 p-3">
        <button type="button" onClick={selectPage} className="rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold">Select {grouped.length} on this page</button>
        {pageCount > 1 && (
          <button type="button" onClick={selectAllFiltered} title="Selects every venue that matches the current filters, across all pages" className="rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-muted hover:border-brand-gold/60 hover:text-brand-gold">Select all {shown.length} filtered</button>
        )}
        {selected.size > 0 && <button type="button" onClick={clearSel} className="rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-muted hover:text-text-primary">Clear ({selected.size})</button>}
        <div className="mx-1 h-5 w-px bg-border-subtle" />
        {running ? (
          <>
            <span className="text-sm text-text-secondary">{progress.kind}: {progress.done + progress.attention} of {progress.total} · {progress.attention} need attention{progress.skipped ? ` · ${progress.skipped} skipped (14-day cooldown)` : ""}</span>
            <button type="button" onClick={() => { pauseRef.current = !pauseRef.current; setPaused(pauseRef.current); }} className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold">{paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}{paused ? "Resume" : "Pause"}</button>
            <button type="button" onClick={() => { stopRef.current = true; pauseRef.current = false; setPaused(false); }} className="inline-flex items-center gap-1.5 rounded-md border border-destructive/60 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"><Square className="h-3.5 w-3.5" />Stop</button>
          </>
        ) : (
          ACTIONS.map((a) => {
            const est = estimateCost(a.kind, selCount);
            return (
              <button key={a.kind} type="button" onClick={() => requestBatch(a.kind)} disabled={selCount === 0} className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-2 text-xs font-bold uppercase tracking-[0.04em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40">
                <a.icon className="h-3.5 w-3.5" />{a.label} ({selCount})
                {est > 0 && <span className="font-normal normal-case text-text-muted">· {fmtUsd(est)}</span>}
              </button>
            );
          })
        )}
      </div>
      {confirmBatch && (
        // Part 1 (§6) — a CENTRED, visible overlay. It used to be an inline
        // banner with no positioning, so above ~20 venues it rendered off-screen
        // and looked like a hard "20 cap". It never was one: confirm here and the
        // whole selection runs, whatever its size.
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmBatch(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-brand-gold/50 bg-surface-0 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-heading text-lg font-bold text-text-primary">Confirm batch run</h3>
            <p className="mt-2 text-sm text-text-secondary">
              This will run <strong className="text-text-primary">{confirmBatch.kind}</strong> on{" "}
              <strong className="text-text-primary">{confirmBatch.n}</strong> venue{confirmBatch.n === 1 ? "" : "s"} —
              estimated <strong className="text-brand-gold">{fmtUsd(confirmBatch.est)}</strong> total.
            </p>
          <div className="mt-5 ml-auto flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmBatch(null)} className="rounded-md border border-border-default px-4 py-2 text-xs font-semibold text-text-muted hover:text-text-primary">Cancel</button>
            <button type="button" onClick={() => doBatch(confirmBatch.kind)} className="rounded-md bg-brand-gold px-4 py-2 text-xs font-bold uppercase text-text-inverse hover:bg-brand-gold/90">Confirm &amp; run {confirmBatch.n}</button>
          </div>
          </div>
        </div>
      )}
      {chainGateway && (
        <div className="mb-4 rounded-xl border border-brand-gold/50 bg-brand-gold/10 px-4 py-3">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text-primary">
                <strong>{chainGateway.brand}</strong> looks like a chain —{" "}
                <strong>{chainGateway.seeded.length}</strong> location
                {chainGateway.seeded.length === 1 ? "" : "s"} added below as seeds{" "}
                <span className="text-text-secondary">($0 spent)</span>. Select which to enrich.
              </p>
              {chainGateway.seeded.length > 0 && (
                <p className="mt-1 text-xs text-text-secondary">
                  Seeded: {chainGateway.seeded.map((s) => s.label).join(", ")}
                </p>
              )}
              {!chainGateway.rostered && (
                <p className="mt-2 text-xs text-text-secondary">
                  {chainGateway.chainLocationsUrl ? (
                    <>
                      Found their locations page —{" "}
                      <a href={chainGateway.chainLocationsUrl} target="_blank" rel="noreferrer" className="text-brand-gold underline">
                        {chainGateway.chainLocationsUrl.replace(/^https?:\/\//, "").slice(0, 48)}
                      </a>
                      . Run a full roster scan to find every branch?
                    </>
                  ) : (
                    <>No locations page was found — a roster scan will do a single capped search for the brand&apos;s official locations.</>
                  )}{" "}
                  <span className="text-text-muted">Bounded, one-off, hard-capped {fmtUsd(0.05)}.</span>
                </p>
              )}
              {chainGateway.result && <p className="mt-2 text-xs text-emerald-400">{chainGateway.result}</p>}
              <div className="mt-2 flex gap-2">
                {!chainGateway.rostered && (
                  <button
                    type="button"
                    onClick={() => runRosterScan(chainGateway.venueId)}
                    disabled={chainGateway.scanning}
                    className="inline-flex items-center gap-1.5 rounded-md bg-brand-gold px-3 py-1.5 text-xs font-bold uppercase text-text-inverse hover:bg-brand-gold/90 disabled:opacity-50"
                  >
                    {chainGateway.scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {chainGateway.scanning ? "Scanning…" : "Scan full roster"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setChainGateway(null)}
                  className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text-primary"
                >
                  {chainGateway.rostered ? "Done" : "Dismiss"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {running && <p className="mb-3 text-xs text-text-muted">One venue at a time. Pause/Stop halts after the current venue — never mid-record.</p>}
      <p className="mb-3 text-xs text-text-muted">Cost-capped: bounded search + Haiku writer, hard ceiling {fmtUsd(COST_PER_VENUE_CEILING)}/venue. Estimates shown per batch; anything over {fmtUsd(BATCH_CONFIRM_THRESHOLD)} asks first.</p>

      {/* Part A — re-enrich builds ON the venue's current details & copy. */}
      <label className="mb-3 inline-flex items-start gap-2 rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-xs text-text-secondary">
        <input type="checkbox" checked={useExisting} onChange={(e) => setUseExisting(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-[#D4AF37]" />
        <span>
          <span className="font-semibold text-text-primary">Use existing details &amp; copy as sources</span> — re-enrich reads any website/Instagram you&apos;ve added FIRST, treats your details as authoritative, and pulls facts out of the current description instead of starting cold. Protected hand-written copy is never overwritten (new copy is proposed for review). Uncheck for a from-scratch redo.
        </span>
      </label>

      {/* Legend — what the row actions do */}
      <p className="mb-3 text-xs text-text-muted">
        <span className="font-semibold text-text-secondary">Actions:</span>{" "}
        <Sparkles className="inline h-3 w-3 align-[-2px]" /> Enrich (research + write) ·{" "}
        <PenLine className="inline h-3 w-3 align-[-2px]" /> Rewrite (re-word from saved research) ·{" "}
        <RefreshCw className="inline h-3 w-3 align-[-2px]" /> Update details (refresh facts only — leaves copy alone) ·{" "}
        <Instagram className="inline h-3 w-3 align-[-2px]" /> Find IG ·{" "}
        <ImageIcon className="inline h-3 w-3 align-[-2px]" /> Hero ·{" "}
        <Eye className="inline h-3 w-3 align-[-2px]" /> Preview ·{" "}
        <Check className="inline h-3 w-3 align-[-2px]" /> Publish ·{" "}
        <X className="inline h-3 w-3 align-[-2px]" /> Decline/Unpublish. On a
        live venue, new copy waits as <span className="text-brand-gold">pending copy</span> until
        you Approve it. (Hover any icon for its label.)
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border-subtle">
        {/* min-width keeps the columns at their natural size so the wrapper
            SCROLLS on a narrow viewport instead of compressing the action cell
            and clipping icons off either edge. The checkbox + Venue columns are
            pinned (position: sticky, left) so the venue NAME stays visible while
            you scroll right to reach the action icons — neither edge clips. */}
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-surface-1 text-xs uppercase tracking-[0.05em] text-text-muted">
            <tr>
              <th className="sticky left-0 z-20 w-11 bg-surface-1 px-3 py-3">
                <input
                  ref={headerCbRef}
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={togglePageSelection}
                  className="h-4 w-4 accent-[#D4AF37]"
                  aria-label="Select all venues on this page"
                  title="Select all on this page"
                />
              </th>
              <th className="sticky left-11 z-20 bg-surface-1 px-3 py-3 font-semibold"><SortBtn k="name" label="Venue" /></th>
              <th className="px-3 py-3 font-semibold"><SortBtn k="status" label="Status" /></th>
              <th className="px-3 py-3 font-semibold"><SortBtn k="photo" label="📷" /></th>
              <th className="px-3 py-3 font-semibold"><SortBtn k="ig" label="IG" /></th>
              <th className="px-3 py-3 font-semibold"><SortBtn k="enriched" label="Enriched" /></th>
              <th className="px-3 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ v, indent }) => {
              const rt = status[v.id]?.state;
              const busy = rt === "running" || rt === "queued";
              const f = freshness(v.enriched_at);
              const needsEnrich = v.lat === 0 && v.lng === 0;
              // A sibling whose flagship isn't rich yet: block its enrich/rewrite.
              const pReady = parentReady(v);
              const blockSibling = v.chainSeed && !pReady;
              return (
                <Fragment key={v.id}>
                  <tr
                    ref={(el) => {
                      if (el) rowRefs.current.set(v.id, el);
                      else rowRefs.current.delete(v.id);
                    }}
                    className={`border-t border-border-subtle align-top transition-colors duration-500 ${indent ? "bg-surface-1/30" : "bg-surface-0"} ${
                      highlightId === v.id ? "ring-2 ring-inset ring-brand-gold/70 !bg-brand-gold/10" : ""
                    }`}
                  >
                    <td className={`sticky left-0 z-10 w-11 px-3 py-3 ${indent ? "bg-surface-1" : "bg-surface-0"}`}><input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} className="mt-1 h-4 w-4 accent-[#D4AF37]" aria-label={`Select ${v.name}`} /></td>
                    <td className={`sticky left-11 z-10 px-3 py-3 ${indent ? "border-l-2 border-brand-sienna/40 pl-4 bg-surface-1" : "bg-surface-0"}`}>
                      <div className="font-semibold text-text-primary">
                        {indent && <span className="mr-1 text-brand-sienna-light" aria-hidden="true">↳</span>}
                        {v.name}
                        {v.location_label && <span className="ml-1.5 text-xs font-normal text-brand-sienna-light">· {v.location_label}</span>}
                        {/* Confident FLAGSHIP badge — ONLY on a CONFIRMED flagship
                            (rostered AND flagship set). Never while flagship_unset. */}
                        {!v.chainSeed && v.chainRostered && !v.flagshipUnset && (
                          <span
                            title="Flagship — the chain's home / original location"
                            className="ml-2 inline-flex items-center gap-1 rounded-full border border-brand-gold/50 bg-brand-gold/10 px-1.5 py-0.5 align-[1px] text-[0.625rem] font-bold uppercase tracking-[0.05em] text-brand-gold"
                          >
                            <Crown className="h-3 w-3" />Flagship
                          </span>
                        )}
                        {/* Ambiguous chain — NOT a confident flagship. */}
                        {v.flagshipUnset && (
                          <span
                            title="Chain detected — the original couldn't be auto-identified. Pick the flagship."
                            className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 align-[1px] text-[0.625rem] font-bold uppercase tracking-[0.04em] text-amber-400"
                          >
                            <AlertTriangle className="h-3 w-3" />Flagship not set
                          </span>
                        )}
                        {/* At-a-glance CHAIN indicator for the no-badge states: a
                            chain candidate (roster not built) or a sibling seed. */}
                        {(v.chainCandidate || v.chainSeed) && !v.flagshipUnset && (
                          <span
                            title={v.chainSeed ? "One location of a chain" : "Looks like a chain — a roster can be built"}
                            className="ml-2 inline-flex items-center gap-1 rounded-full border border-brand-sienna/40 bg-brand-sienna/10 px-1.5 py-0.5 align-[1px] text-[0.625rem] font-bold uppercase tracking-[0.05em] text-brand-sienna-light"
                          >
                            <Store className="h-3 w-3" />Chain
                          </span>
                        )}
                        {/* Chain CHILD → flagship state. Green "Flagship Set" =
                            the parent is crowned AND enriched (good to work this
                            child). Amber "Flagship pending" otherwise. Click →
                            popup with the flagship's published summary. */}
                        {v.chainSeed && v.chainParentId && (() => {
                          const flag = flagshipById.get(v.chainParentId);
                          const ready = flag ? flag.enriched : pReady;
                          return (
                            <button
                              type="button"
                              onClick={() => flag && setFlagshipPopup(flag)}
                              title={flag ? (ready ? "Flagship is crowned & enriched — you're clear to enrich this branch. Click to view its summary." : "Flagship isn't enriched yet — enrich the flagship first.") : "Flagship"}
                              className={`ml-2 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 align-[1px] text-[0.625rem] font-bold uppercase tracking-[0.05em] transition-colors ${ready ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25" : "border-amber-500/50 bg-amber-500/10 text-amber-400"}`}
                            >
                              <Crown className="h-3 w-3" />{ready ? "Flagship Set" : "Flagship pending"}
                            </button>
                          );
                        })()}
                        {v.permanentlyClosed && (
                          <span
                            title="Permanently closed — hidden from the public map, directory, Featured & count"
                            className="ml-2 inline-flex items-center gap-1 rounded-full border border-destructive/50 bg-destructive/10 px-1.5 py-0.5 align-[1px] text-[0.625rem] font-bold uppercase tracking-[0.05em] text-destructive"
                          >
                            <Ban className="h-3 w-3" />Closed
                          </span>
                        )}
                        {v.isFeatured && !v.permanentlyClosed && (
                          <span
                            title="Featured on the homepage & directory"
                            className="ml-2 inline-flex items-center gap-1 rounded-full border border-brand-gold/50 bg-brand-gold/10 px-1.5 py-0.5 align-[1px] text-[0.625rem] font-bold uppercase tracking-[0.05em] text-brand-gold"
                          >
                            <Star className="h-3 w-3 fill-brand-gold" />Featured
                          </span>
                        )}
                        {/* Part 5 — flag a non-dine-in item type right on the row so
                            a non-venue (cooking school, caterer, shop…) is obvious
                            in the queue. Restaurants/food-trucks show no chip. */}
                        {v.category && !isDineInCategory(v.category as ItemCategory) && (
                          <span
                            title={`Item type: ${ITEM_CATEGORY_LABELS[v.category as ItemCategory] ?? v.category}${v.manualCategory ? " (set by operator)" : " (classified by enrichment)"} — not a dine-in venue`}
                            className="ml-2 inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 align-[1px] text-[0.625rem] font-bold uppercase tracking-[0.05em] text-amber-400"
                          >
                            {ITEM_CATEGORY_LABELS[v.category as ItemCategory] ?? v.category}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-muted">{[v.city, v.country].filter(Boolean).join(", ")} · {v.styleLabel}</div>
                      {v.chainSeed && v.chainParentId && flagshipById.get(v.chainParentId) && (
                        <div className="mt-0.5 text-[0.6875rem] text-text-muted">
                          Branch of <span className="text-text-secondary">{flagshipById.get(v.chainParentId)!.name}</span>{" "}
                          ·{" "}
                          <a
                            href={`/restaurants/${flagshipById.get(v.chainParentId)!.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-gold hover:underline"
                          >
                            view flagship ↗
                          </a>
                        </div>
                      )}
                      {v.needs_attention && v.attention_reason && (
                        <div className="mt-1 inline-flex items-start gap-1 text-xs text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{v.attention_reason}</div>
                      )}
                      {/* geocode-fix — a shaky pin looks different at a glance in the row;
                          a Confirmed pin shows nothing here (the editor shows its green badge). */}
                      {(() => {
                        const pc = pinConfidence({ lat: v.lat, lng: v.lng, geoLocked: v.geoLocked, geoPrecision: v.geoPrecision, geoConfidence: v.geoConfidence });
                        if (pc === "approximate") {
                          return <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[0.625rem] font-semibold text-amber-400" title="Approximate pin — postcode/town-level or low confidence. Verify the exact spot."><AlertTriangle className="h-3 w-3" />Pin approximate</div>;
                        }
                        if (pc === "missing") {
                          return <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[0.625rem] font-semibold text-destructive" title="No pin set — place it on the map."><MapPinOff className="h-3 w-3" />Pin missing</div>;
                        }
                        return null;
                      })()}
                      {v.provenance && (
                        <div className="mt-1 text-[0.6875rem] leading-relaxed text-text-muted">
                          {v.provenance.source === "member" ? (
                            <>
                              <span className="text-text-secondary">Submitted</span>
                              {v.provenance.submission?.email && (
                                <> · {v.provenance.submission.email}</>
                              )}
                              {v.provenance.submission?.country && (
                                <> · {v.provenance.submission.country}</>
                              )}
                              {v.provenance.submission?.ip && (
                                <> · IP {v.provenance.submission.ip}</>
                              )}
                              {v.provenance.submission?.status && (
                                <> · {v.provenance.submission.status}</>
                              )}
                            </>
                          ) : (
                            <span>No submission — bulk import (IG seed / chain discovery)</span>
                          )}
                          {v.provenance.updatedActor && v.provenance.updatedAt && (
                            <> · updated by {v.provenance.updatedActor} {new Date(v.provenance.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>
                          )}
                        </div>
                      )}
                      {/* Step 1 → 2: this venue looks like a chain but has no roster
                          yet — offer to build it. Nothing is crowned. */}
                      {v.chainCandidate && !v.chainRostered && !v.chainSeed && !v.flagshipUnset && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => buildRoster(v)}
                            disabled={busy}
                            title="Read the brand's locations page and add every branch as a seed"
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold uppercase tracking-[0.03em] text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
                          >
                            <Store className="h-3 w-3" />Build roster
                          </button>
                          <button
                            type="button"
                            onClick={() => dismissChain(v)}
                            disabled={busy}
                            title="Not a chain — clear the flag and treat as a single venue"
                            className="text-xs text-text-muted underline-offset-2 hover:text-text-primary hover:underline disabled:opacity-40"
                          >
                            Not a chain
                          </button>
                        </div>
                      )}
                      {/* Step 3: chain in "flagship not set" state — one-click pick
                          of the original on every member. */}
                      {v.flagshipUnset && (
                        <div className="mt-1">
                          <button
                            type="button"
                            onClick={() => setFlagship(v)}
                            disabled={busy}
                            title="Make this the chain's flagship / original location"
                            className="inline-flex items-center gap-1 rounded-md border border-brand-gold/50 bg-brand-gold/10 px-2 py-0.5 text-xs font-bold uppercase tracking-[0.03em] text-brand-gold transition-colors hover:bg-brand-gold/20 disabled:opacity-40"
                          >
                            <Crown className="h-3 w-3" />Set as flagship
                          </button>
                        </div>
                      )}
                      {/* The "seed" label + big Enrich CTA show ONLY while this is
                          an un-enriched chain seed (pending AND never enriched).
                          Once enriched or published it's a normal row. */}
                      {v.chainSeed && v.status === "pending" && !v.enriched_at && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {/* Status LABEL (not a button) — §09.2.10 */}
                          <span className="inline-flex items-center gap-1 rounded-full border border-brand-sienna/40 bg-brand-sienna/10 px-2 py-0.5 text-xs font-semibold text-brand-sienna-light">
                            Chain location · seed
                          </span>
                          {/* Distinct ACTION button — blocked until the flagship
                              is rich (the sibling inherits its brand facts). */}
                          <button
                            type="button"
                            onClick={() => single(v, "enrich", { useExisting })}
                            disabled={busy || blockSibling}
                            title={blockSibling ? PARENT_FIRST_MSG : "Enrich this location"}
                            className="inline-flex items-center gap-1 rounded-md bg-brand-sienna px-2.5 py-1 text-xs font-bold uppercase text-text-inverse transition-colors hover:bg-brand-sienna/90 disabled:opacity-40"
                          >
                            <Sparkles className="h-3.5 w-3.5" />Enrich this location
                          </button>
                        </div>
                      )}
                      {blockSibling && v.status === "pending" && !v.enriched_at && (
                        <div className="mt-1 inline-flex items-start gap-1 text-xs text-amber-400/90">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{PARENT_FIRST_MSG}
                        </div>
                      )}
                      {v.hasPending && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full border border-brand-gold/40 bg-brand-gold/10 px-2 py-0.5 font-semibold text-brand-gold">Pending changes — not yet live</span>
                          <button type="button" onClick={() => setPreview(previewFromRow(v))} className="font-semibold text-brand-gold hover:underline">Review diff</button>
                          <button type="button" onClick={() => copyDecision(v.id, "approve")} className="font-semibold text-emerald-400 hover:underline">Approve</button>
                          <button type="button" onClick={() => copyDecision(v.id, "discard")} className="text-text-muted hover:text-destructive">Discard</button>
                        </div>
                      )}
                      {rowResult[v.id]?.msg && <div className="mt-1 text-xs text-emerald-400">{rowResult[v.id]?.msg}</div>}
                      {rowResult[v.id]?.warn && <div className="mt-1 flex items-start gap-1 text-xs text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{rowResult[v.id]?.warn}</div>}
                      {rowResult[v.id]?.err && <div className="mt-1 text-xs text-destructive">{rowResult[v.id]?.err}</div>}
                    </td>
                    <td className="px-3 py-3">
                      {rt && rt !== "idle" && rt !== "done" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-gold">{busy && <Loader2 className="h-3 w-3 animate-spin" />}{rt === "running" ? "Working…" : rt === "queued" ? "Queued" : rt === "attention" ? "Attention" : (status[v.id]?.msg ?? "Error")}</span>
                      ) : (
                        /* One consistent label for the approved state — a finished
                           ("done") row shows its real status, never a stray "Done". */
                        <span className="text-xs capitalize text-text-secondary">{v.status === "approved" ? "Published" : v.status}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">{v.hasRealPhoto ? <span className="text-emerald-400">yes</span> : <span className="text-text-muted">default</span>}</td>
                    <td className="px-3 py-3 text-xs">{v.hasIG ? <span className="text-emerald-400">✓ {v.postsCount || ""}</span> : <span className="text-text-muted">–</span>}</td>
                    <td className="px-3 py-3 text-xs text-text-muted">
                      {/* RAG freshness dot (§09.2.5): green fresh · amber ageing · red stale/never */}
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${FRESH_DOT[f.tone]}`} title={`Enriched: ${f.label}`} />
                        {f.label}
                      </span>
                      {v.cost > 0 && (
                        <span className="ml-1 text-text-secondary" title="This-run cost · accumulated total across all runs">
                          · {fmtUsd(v.lastRunCost || v.cost)} run
                          {v.lastRunCost > 0 && v.cost > v.lastRunCost + 0.0001 && (
                            <span className="text-text-muted"> · {fmtUsd(v.cost)} total</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {/* Compact, single-line actions (icon-only) so rows never
                          wrap/fatten at narrow widths. Titles carry the labels. */}
                      <div className="flex flex-nowrap items-center justify-end gap-1">
                        <IconBtn title={blockSibling ? PARENT_FIRST_MSG : "Re-research + rewrite (Grok researches, Claude writes)"} busy={busy || blockSibling} onClick={() => single(v, "enrich", { useExisting })}><Sparkles className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn title={blockSibling ? PARENT_FIRST_MSG : "Rewrite copy from saved research (Claude only)"} busy={busy || blockSibling} onClick={() => single(v, "rewrite")}><PenLine className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn title="Update details — refresh hours, phone, price, socials & closed/moved only (leaves the copy untouched)" busy={busy} onClick={() => single(v, "ops")}><RefreshCw className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn title={v.hasIG ? "IG ✓ — re-run Find IG" : "Find IG (handle + recent posts)"} busy={busy} onClick={() => single(v, "findig")}>
                          <Instagram className={`h-3.5 w-3.5 ${v.hasIG ? "text-emerald-400" : ""}`} />
                        </IconBtn>
                        <IconBtn title="Hero image" onClick={() => setHeroOpen(heroOpen === v.id ? null : v.id)}><ImageIcon className="h-3.5 w-3.5" /></IconBtn>
                        <button
                          type="button"
                          onClick={() => setFlag(v, { is_featured: !v.isFeatured })}
                          disabled={busy || v.permanentlyClosed}
                          title={v.permanentlyClosed ? "Closed venues can't be featured" : v.isFeatured ? "Featured — tap to unfeature" : "Feature on the homepage & directory"}
                          className={`inline-flex shrink-0 items-center rounded-md border p-1.5 transition-colors disabled:opacity-40 ${v.isFeatured ? "border-brand-gold/60 text-brand-gold" : "border-border-default text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"}`}
                        >
                          <Star className={`h-3.5 w-3.5 ${v.isFeatured ? "fill-brand-gold" : ""}`} />
                        </button>
                        <IconBtn title="Edit venue — copy, every field & map pin" onClick={() => setLocOpen(locOpen === v.id ? null : v.id)}><SquarePen className="h-3.5 w-3.5" /></IconBtn>
                        <button type="button" onClick={() => setPreview(previewFromRow(v))} title="Preview the copy that will publish" className="inline-flex shrink-0 items-center rounded-md border border-border-strong p-1.5 text-text-primary transition-colors hover:border-brand-gold/60 hover:text-brand-gold">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {v.status !== "approved" ? (
                          <>
                            <button type="button" onClick={() => single(v, "publish")} disabled={busy || needsEnrich} title={needsEnrich ? "Enrich first (no map location)" : "Publish"} className="inline-flex shrink-0 items-center rounded-md bg-brand-gold p-1.5 text-text-inverse disabled:opacity-40">
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => single(v, "park")} disabled={busy} title="Park — move to the holding pen (not a venue / not now). Kept, not deleted; return to Pending anytime." className="inline-flex shrink-0 items-center rounded-md border border-border-default p-1.5 text-text-muted transition-colors hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40">
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => single(v, "reject")} disabled={busy} title="Decline — remove from the queue" className="inline-flex shrink-0 items-center rounded-md border border-border-default p-1.5 text-text-muted transition-colors hover:border-destructive hover:text-destructive disabled:opacity-40">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => single(v, "reject")} disabled={busy} title="Unpublish — pull this venue from the live site" className="inline-flex shrink-0 items-center rounded-md border border-border-default p-1.5 text-text-muted transition-colors hover:border-destructive hover:text-destructive disabled:opacity-40">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {heroOpen === v.id && (
                    <tr className="border-t border-border-subtle bg-surface-1/40">
                      <td colSpan={7} className="px-3 py-4">
                        <HeroPanel venue={v} styleOptions={styleOptions} onDone={() => { setHeroOpen(null); router.refresh(); }} />
                      </td>
                    </tr>
                  )}
                  {locOpen === v.id && (
                    <tr className="border-t border-border-subtle bg-surface-1/40">
                      <td colSpan={7} className="px-3 py-4">
                        <EditorPanel
                          venue={v}
                          styleOptions={styleOptions}
                          flagshipChoices={flagshipChoices}
                          onDone={() => { markActed(v.id); setLocOpen(null); router.refresh(); }}
                          onDelete={() => { setLocOpen(null); deleteVenue(v); }}
                          onDetach={() => chainEdit(v, "detach")}
                          onAttach={(pid) => chainEdit(v, "attach", pid)}
                          onFlag={(patch) => setFlag(v, patch)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pager — 50 top-level venues per page (chain children ride with their
          flagship). Filters/sort/search operate over the whole catalogue above. */}
      {(units.length > PAGE_SIZE || showAll) && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => { setShowAll((s) => !s); setPage(1); }}
            className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
          >
            {showAll ? "Paginate (50 / page)" : `Show all ${topLevelCount} on one page`}
          </button>
        </div>
      )}
      {pageCount > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setPage(1)}
            disabled={safePage === 1}
            className="rounded-md border border-border-default px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-30"
          >
            « First
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-30"
          >
            ‹ Prev
          </button>
          <span className="px-1 text-text-secondary">
            Page{" "}
            <input
              type="number"
              min={1}
              max={pageCount}
              value={safePage}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setPage(Math.min(Math.max(1, n), pageCount));
              }}
              className="w-14 rounded-md border border-border-default bg-surface-0 px-2 py-1 text-center text-sm text-text-primary focus:border-brand-gold/60 focus:outline-none"
              aria-label="Jump to page"
            />{" "}
            of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={safePage === pageCount}
            className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-30"
          >
            Next ›
          </button>
          <button
            type="button"
            onClick={() => setPage(pageCount)}
            disabled={safePage === pageCount}
            className="rounded-md border border-border-default px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-30"
          >
            Last »
          </button>
          <span className="ml-1 text-xs text-text-muted">
            {pageStart}–{pageEnd} of {topLevelCount}
          </span>
        </div>
      )}

      {/* Slim FLOATING bulk-action bar — so with rows selected at the bottom of a
          long list, the bulk actions are reachable without scrolling to the top.
          Deliberately slim (a pill), and the list stays fully visible behind it. */}
      {(selCount > 0 || running) && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-[95vw] items-center gap-1.5 overflow-x-auto rounded-full border border-border-strong bg-surface-0/95 px-3 py-2 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-surface-0/80">
            {running ? (
              <>
                <span className="whitespace-nowrap px-1 text-xs font-semibold text-text-secondary">
                  {progress.kind}: {progress.done + progress.attention}/{progress.total}
                  {progress.attention ? ` · ${progress.attention} attn` : ""}
                  {progress.skipped ? ` · ${progress.skipped} skipped` : ""}
                </span>
                <button type="button" onClick={() => { pauseRef.current = !pauseRef.current; setPaused(pauseRef.current); }} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border-default px-2.5 py-1 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold">
                  {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}{paused ? "Resume" : "Pause"}
                </button>
                <button type="button" onClick={() => { stopRef.current = true; pauseRef.current = false; setPaused(false); }} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/60 px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10">
                  <Square className="h-3.5 w-3.5" />Stop
                </button>
              </>
            ) : (
              <>
                <span className="whitespace-nowrap px-1 text-xs font-bold text-text-primary">{selCount} selected</span>
                <span className="h-4 w-px shrink-0 bg-border-subtle" />
                {FLOAT_ACTIONS.map((a) => {
                  const est = estimateCost(a.kind, selCount);
                  return (
                    <button
                      key={a.kind}
                      type="button"
                      onClick={() => requestBatch(a.kind)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border-default px-2.5 py-1 text-xs font-bold uppercase tracking-[0.03em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
                    >
                      <a.icon className="h-3.5 w-3.5" />{a.label}
                      {est > 0 && <span className="font-normal normal-case text-text-muted">· {fmtUsd(est)}</span>}
                    </button>
                  );
                })}
                <span className="h-4 w-px shrink-0 bg-border-subtle" />
                <button type="button" onClick={clearSel} title="Clear selection" className="inline-flex shrink-0 items-center rounded-full p-1 text-text-muted transition-colors hover:text-text-primary">
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {preview &&
        (() => {
          const pv = venues.find((v) => v.id === preview.venueId);
          return pv ? (
            <PreviewModal
              venue={pv}
              mode={preview.mode}
              onClose={() => setPreview(null)}
              onResolved={(id) => setRowResult((p) => ({ ...p, [id]: {} }))}
            />
          ) : null;
        })()}

      {/* Flagship summary popup (read-only) — see the chain you're working on
          without leaving Pending. Close returns straight to Pending. */}
      {flagshipPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={() => setFlagshipPopup(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-border-strong bg-surface-0 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-gold/50 bg-brand-gold/10 px-2.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-brand-gold">
                <Crown className="h-3 w-3" /> Flagship {flagshipPopup.enriched ? "· enriched" : "· not enriched"}
              </span>
              <button type="button" onClick={() => setFlagshipPopup(null)} aria-label="Close" className="shrink-0 text-text-muted transition-colors hover:text-text-primary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <h3 className="mt-3 font-heading text-2xl font-bold text-text-primary">{flagshipPopup.name}</h3>
            <p className="mt-1 text-sm text-text-muted">{[flagshipPopup.city].filter(Boolean).join(", ") || "no city"} · {flagshipPopup.styleLabel}</p>
            {flagshipPopup.hook && <p className="mt-3 font-heading text-sm italic text-text-primary">{flagshipPopup.hook}</p>}
            {flagshipPopup.description && (
              <div className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm leading-relaxed text-text-secondary">
                {flagshipPopup.description.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-3">
              <a href={`/restaurants/${flagshipPopup.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-gold hover:underline">
                Open flagship listing ↗
              </a>
              <button type="button" onClick={() => setFlagshipPopup(null)} className="rounded-md border border-border-default px-4 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold">
                Back to Pending
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, title, onClick, busy }: { children: React.ReactNode; title: string; onClick: () => void; busy?: boolean }) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={busy} className="inline-flex items-center rounded-md border border-border-default px-2 py-1.5 text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40">
      {children}
    </button>
  );
}

const fieldInput =
  "mt-1 w-full rounded-md border border-border-default bg-surface-0 px-2.5 py-1.5 text-sm text-text-primary focus:border-brand-gold/60 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-text-muted">{label}</span>
      {children}
    </label>
  );
}

// The full manual venue editor (Fix 3 + Fix 4 + Fix 5 + Fix 7). Every field is
// hand-editable — copy included — with an interactive tap-to-place map pin, the
// featured/closed flags, and delete / chain-membership controls. Exported so the
// Moderation Queue reuses the exact same editor on a materialised submission.
export function EditorPanel({
  venue,
  styleOptions,
  flagshipChoices,
  onDone,
  onDelete,
  onDetach,
  onAttach,
  onFlag,
}: {
  venue: HubVenue;
  styleOptions: { slug: string; label: string }[];
  flagshipChoices: { id: string; name: string; city: string | null }[];
  onDone: () => void;
  onDelete: () => void;
  onDetach: () => void;
  onAttach: (parentId: string) => void;
  onFlag: (patch: { is_featured?: boolean; permanently_closed?: boolean }) => void;
}) {
  const f = venue.fields as Record<string, unknown>;
  const s = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : "");
  const [name, setName] = useState(venue.name);
  const [label, setLabel] = useState(s("location_label"));
  const [hook, setHook] = useState(venue.hook ?? "");
  const [description, setDescription] = useState(venue.description ?? "");
  const [address, setAddress] = useState(s("address"));
  const [city, setCity] = useState(venue.city ?? "");
  const [country, setCountry] = useState(venue.country ?? "");
  const [lat, setLat] = useState(venue.lat ?? 0);
  const [lng, setLng] = useState(venue.lng ?? 0);
  const [phone, setPhone] = useState(s("phone"));
  const [website, setWebsite] = useState(s("website"));
  const [igHandle, setIgHandle] = useState(s("instagram_handle"));
  const [igUrl, setIgUrl] = useState(s("instagram_url"));
  const [xUrl, setXUrl] = useState(s("x_url"));
  const [fbUrl, setFbUrl] = useState(s("facebook_url"));
  const [ttUrl, setTtUrl] = useState(s("tiktok_url"));
  const [ytUrl, setYtUrl] = useState(s("youtube_url"));
  const [style, setStyle] = useState(venue.style);
  const [category, setCategory] = useState<string>(
    (typeof f.category === "string" && f.category) || venue.category || "restaurant"
  );
  const [price, setPrice] = useState(Number(f.price_level) || 2);
  const [offerings, setOfferings] = useState(
    Array.isArray(f.offerings) ? (f.offerings as string[]).join(", ") : ""
  );
  const [hours, setHours] = useState<Record<string, string> | null>(
    f.hours && typeof f.hours === "object" ? (f.hours as Record<string, string>) : null
  );
  // Part G — operator-editable FAQ (add/edit/remove/reorder). Saving marks the
  // FAQ manual so a later enrich won't overwrite it.
  const [faq, setFaq] = useState<{ q: string; a: string }[]>(
    Array.isArray(f.faq) ? (f.faq as { q: string; a: string }[]).map((e) => ({ q: e.q ?? "", a: e.a ?? "" })) : []
  );
  const moveFaq = (i: number, dir: -1 | 1) =>
    setFaq((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const [attachTo, setAttachTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function save(regeocode: boolean) {
    setBusy(true);
    setErr("");
    setMsg("");
    const body: Record<string, unknown> = {
      restaurantId: venue.id,
      name,
      location_label: label,
      hook,
      description,
      address,
      city,
      country,
      phone,
      website,
      instagram_handle: igHandle,
      instagram_url: igUrl,
      x_url: xUrl,
      facebook_url: fbUrl,
      tiktok_url: ttUrl,
      youtube_url: ytUrl,
      style,
      category,
      price_level: price,
      offerings: offerings.split(",").map((o) => o.trim()).filter(Boolean),
      hours,
      faq: faq.map((e) => ({ q: e.q.trim(), a: e.a.trim() })).filter((e) => e.q && e.a),
      regeocode,
    };
    if (!regeocode) {
      body.lat = lat;
      body.lng = lng;
    }
    let res: Response;
    try {
      res = await fetch("/api/admin/venues/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setBusy(false);
      setErr("Network error");
      return;
    }
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error ?? "Failed");
      return;
    }
    if (typeof data.lat === "number") setLat(data.lat);
    if (typeof data.lng === "number") setLng(data.lng);
    const branchNote = data.styled_branches > 0 ? ` · applied the style to ${data.styled_branches} branch${data.styled_branches === 1 ? "" : "es"}` : "";
    setMsg((regeocode ? `Saved · re-geocoded → ${data.lat?.toFixed?.(5)}, ${data.lng?.toFixed?.(5)}.` : "Saved.") + branchNote);
    onDone();
  }

  return (
    <div className="space-y-4">
      {/* Copy — hook + description (manual edits are sacred) */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.05em] text-text-muted">Copy (house voice)</p>
        <Field label="Hook (one line)">
          <input value={hook} onChange={(e) => setHook(e.target.value)} className={fieldInput} placeholder="A pit, a queue, and the quiet confidence of a place that knows what it is." />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className={`${fieldInput} resize-y font-sans leading-relaxed`} placeholder="Two or three short paragraphs, blank line between them." />
        </Field>
        {venue.manualCopy && (
          <p className="text-xs text-emerald-400/90">This copy is hand-edited — a future AI enrich will ask before overwriting it.</p>
        )}
      </div>

      {/* Core fields */}
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className={fieldInput} /></Field>
        <Field label="Location label (branch)"><input value={label} onChange={(e) => setLabel(e.target.value)} className={fieldInput} placeholder="Bermondsey" /></Field>
        <Field label="BBQ style">
          <select value={style} onChange={(e) => setStyle(e.target.value)} className={fieldInput}>
            {styleOptions.map((o) => <option key={o.slug} value={o.slug}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Item type">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldInput}>
            {ITEM_CATEGORY_OPTIONS.map((o) => <option key={o.slug} value={o.slug}>{o.label}</option>)}
          </select>
          {!isDineInCategory(category as ItemCategory) && (
            <p className="mt-1 text-[0.6875rem] text-amber-400/90">Not a dine-in venue — held out of live until a later wave. Saving confirms this type; a re-enrich won&apos;t change it.</p>
          )}
        </Field>
        <Field label="Price band">
          <select value={price} onChange={(e) => setPrice(Number(e.target.value))} className={fieldInput}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{"$".repeat(n)}</option>)}
          </select>
        </Field>
        <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldInput} /></Field>
        <Field label="Website"><input value={website} onChange={(e) => setWebsite(e.target.value)} className={fieldInput} /></Field>
        <Field label="Instagram handle"><input value={igHandle} onChange={(e) => setIgHandle(e.target.value)} className={fieldInput} placeholder="joesbbq" /></Field>
        <Field label="Instagram URL"><input value={igUrl} onChange={(e) => setIgUrl(e.target.value)} className={fieldInput} /></Field>
        <Field label="Facebook URL"><input value={fbUrl} onChange={(e) => setFbUrl(e.target.value)} className={fieldInput} /></Field>
        <Field label="X URL"><input value={xUrl} onChange={(e) => setXUrl(e.target.value)} className={fieldInput} /></Field>
        <Field label="TikTok URL"><input value={ttUrl} onChange={(e) => setTtUrl(e.target.value)} className={fieldInput} /></Field>
        <Field label="YouTube URL"><input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} className={fieldInput} /></Field>
        <Field label="Offerings (comma-separated)"><input value={offerings} onChange={(e) => setOfferings(e.target.value)} className={fieldInput} placeholder="brisket, ribs, burnt ends" /></Field>
      </div>

      {/* Opening hours — friendly editor + natural-text parser */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.05em] text-text-muted">Opening hours</p>
        <HoursEditor value={hours} onChange={setHours} />
      </div>

      {/* Part G — per-venue FAQ editor. These entries merge ABOVE the auto-generated
          FAQ on the venue page (and into the FAQPage JSON-LD). Saving marks the FAQ
          hand-edited, so a later enrich won't overwrite it. */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.05em] text-text-muted">FAQ (shown above the auto-generated questions)</p>
        {faq.length === 0 && (
          <p className="text-xs text-text-muted">No custom FAQ yet — the venue page auto-generates style/location questions. Add your own below.</p>
        )}
        <div className="space-y-3">
          {faq.map((e, i) => (
            <div key={i} className="rounded-lg border border-border-subtle bg-surface-0 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted">Q{i + 1}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveFaq(i, -1)} disabled={i === 0} className="rounded border border-border-default px-2 py-0.5 text-xs text-text-secondary disabled:opacity-30" title="Move up">↑</button>
                  <button type="button" onClick={() => moveFaq(i, 1)} disabled={i === faq.length - 1} className="rounded border border-border-default px-2 py-0.5 text-xs text-text-secondary disabled:opacity-30" title="Move down">↓</button>
                  <button type="button" onClick={() => setFaq((p) => p.filter((_, k) => k !== i))} className="rounded border border-border-default px-2 py-0.5 text-xs text-destructive hover:border-destructive" title="Remove">✕</button>
                </div>
              </div>
              <input
                value={e.q}
                onChange={(ev) => setFaq((p) => p.map((x, k) => (k === i ? { ...x, q: ev.target.value } : x)))}
                className={`${fieldInput} mb-2`}
                placeholder="Question (e.g. Do you take bookings?)"
              />
              <textarea
                value={e.a}
                onChange={(ev) => setFaq((p) => p.map((x, k) => (k === i ? { ...x, a: ev.target.value } : x)))}
                rows={2}
                className={`${fieldInput} resize-y`}
                placeholder="Answer"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setFaq((p) => [...p, { q: "", a: "" }])}
          className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
        >
          + Add FAQ entry
        </button>
      </div>

      {/* Featured video (Phase 6.7 B1) — validated via the YouTube Data API */}
      <FeaturedVideoControl venue={venue} />

      {/* Address & map pin (Fix 4) */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.05em] text-text-muted">Address &amp; map pin</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs text-text-muted">Full address (include postcode/ZIP)</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="8-9 Snowsfields, SE1 3SU" className={fieldInput} />
          </label>
          <Field label="City / locale"><input value={city} onChange={(e) => setCity(e.target.value)} className={fieldInput} placeholder="Bermondsey" /></Field>
          <Field label="Country"><input value={country} onChange={(e) => setCountry(e.target.value)} className={fieldInput} placeholder="United Kingdom" /></Field>
        </div>
        <PinMap lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln); }} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-text-muted">
            Tap the map or drag the pin to place it — lat/lng fill in automatically ({lat.toFixed(5)}, {lng.toFixed(5)}). No need to type coordinates.
          </p>
          {(() => {
            const conf = pinConfidence({ lat, lng, geoLocked: venue.geoLocked, geoPrecision: venue.geoPrecision, geoConfidence: venue.geoConfidence });
            if (conf === "confirmed") {
              const locked = Boolean(venue.geoLocked);
              return (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400" title={locked ? "Pin locked — hand-placed; re-geocoding will not move it. Use “Save & re-geocode from address” to unlock and re-place." : "Confident pin — validated address/POI level."}>
                  {locked ? <Lock className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                  {locked ? "Pin locked" : "Pin confirmed"}
                </span>
              );
            }
            if (conf === "approximate") {
              return (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400" title="Approximate pin — postcode-area or low-confidence. Verify the exact spot, then Save to lock it.">
                  <AlertTriangle className="h-3 w-3" />Pin approximate — verify
                </span>
              );
            }
            return (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive" title="No pin set — place it on the map, then Save.">
                <MapPinOff className="h-3 w-3" />Pin missing
              </span>
            );
          })()}
        </div>
      </div>

      {/* Save */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => save(false)} className="inline-flex items-center gap-1.5 rounded-md bg-brand-gold px-3 py-1.5 text-xs font-bold uppercase text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Save all
        </button>
        <button type="button" disabled={busy} onClick={() => save(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40">
          <MapPin className="h-3.5 w-3.5" />Save &amp; re-geocode from address
        </button>
        {msg && <span className="text-xs text-emerald-400">{msg}</span>}
        {err && <span className="text-xs text-destructive">{err}</span>}
      </div>

      {/* Flags + danger zone */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
        <button type="button" onClick={() => onFlag({ is_featured: !venue.isFeatured })} disabled={venue.permanentlyClosed} className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${venue.isFeatured ? "border-brand-gold/60 bg-brand-gold/10 text-brand-gold" : "border-border-default text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"}`}>
          <Star className={`h-3.5 w-3.5 ${venue.isFeatured ? "fill-brand-gold" : ""}`} />{venue.isFeatured ? "Featured" : "Feature"}
        </button>
        <button type="button" onClick={() => onFlag({ permanently_closed: !venue.permanentlyClosed })} className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold ${venue.permanentlyClosed ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-border-default text-text-secondary hover:border-destructive hover:text-destructive"}`}>
          <Ban className="h-3.5 w-3.5" />{venue.permanentlyClosed ? "Reopen" : "Mark closed"}
        </button>
        {venue.chainSeed ? (
          <button type="button" onClick={onDetach} className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold">
            <Unlink className="h-3.5 w-3.5" />Remove from chain
          </button>
        ) : (
          <div className="inline-flex items-center gap-1.5">
            <select value={attachTo} onChange={(e) => setAttachTo(e.target.value)} className="rounded-md border border-border-default bg-surface-0 px-2 py-1.5 text-xs text-text-primary focus:outline-none">
              <option value="">Attach to chain…</option>
              {flagshipChoices.filter((c) => c.id !== venue.id).map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.city ? ` · ${c.city}` : ""}</option>
              ))}
            </select>
            <button type="button" disabled={!attachTo} onClick={() => onAttach(attachTo)} className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40">
              <Link2 className="h-3.5 w-3.5" />Attach
            </button>
          </div>
        )}
        <button type="button" onClick={onDelete} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-destructive/60 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10">
          <Trash2 className="h-3.5 w-3.5" />Delete
        </button>
      </div>
    </div>
  );
}

/**
 * Featured-video control (Phase 6.7 B1). Paste a YouTube URL → the server
 * validates it exists + is embeddable via the YouTube Data API and caches its
 * title/channel/thumbnail; the venue page then renders a click-to-play facade.
 * Empty + Save clears the feature. Reusable for any venue.
 */
function FeaturedVideoControl({ venue }: { venue: HubVenue }) {
  const f = venue.fields as Record<string, unknown>;
  const initialId = typeof f.featured_video_id === "string" ? f.featured_video_id : "";
  const [url, setUrl] = useState(
    initialId ? `https://www.youtube.com/watch?v=${initialId}` : ""
  );
  const [meta, setMeta] = useState<{ title: string; channel: string; thumb: string | null } | null>(
    initialId
      ? {
          title: (f.featured_video_title as string) ?? "",
          channel: (f.featured_video_channel as string) ?? "",
          thumb: (f.featured_video_thumb as string) ?? null,
        }
      : null
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function submit() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/admin/venues/featured-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: venue.id, url: url.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data.error as string) || "Failed.");
      } else if (data.cleared) {
        setMeta(null);
        setMsg("Cleared.");
      } else {
        setMeta({ title: data.title, channel: data.channel, thumb: data.thumb });
        setMsg("Saved.");
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.05em] text-text-muted">
        <Youtube className="mr-1 inline h-3 w-3 align-[-2px]" />
        Featured video
      </p>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube video URL (empty = clear)"
          className={fieldInput}
        />
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save
        </button>
      </div>
      {meta && (
        <div className="flex items-center gap-3 rounded-md border border-border-subtle bg-surface-1 p-2">
          {meta.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meta.thumb} alt="" className="h-12 w-20 rounded object-cover" referrerPolicy="no-referrer" />
          ) : null}
          <div className="min-w-0 text-xs">
            <p className="truncate font-semibold text-text-primary">{meta.title}</p>
            <p className="text-text-muted">{meta.channel}</p>
          </div>
        </div>
      )}
      {msg && <span className="text-xs text-emerald-400">{msg}</span>}
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  );
}

function HeroPanel({ venue, styleOptions, onDone }: { venue: HubVenue; styleOptions: { slug: string; label: string }[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [style, setStyle] = useState(venue.style);
  const [photos, setPhotos] = useState<{ id: string; url: string }[] | null>(null);
  const [err, setErr] = useState("");

  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/venues/hero", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: venue.id, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) onDone();
    else setErr(data.error ?? "Failed");
  }

  async function loadPhotos() {
    const res = await fetch(`/api/admin/venues/media?id=${venue.id}`);
    const data = await res.json().catch(() => ({ photos: [] }));
    setPhotos(data.photos ?? []);
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <div className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={venue.heroUrl} alt="" className="h-28 w-48 rounded-lg border border-border-subtle object-cover" />
        <p className="mt-1.5 text-xs text-text-muted">{venue.heroSourceLabel}</p>
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={style} onChange={(e) => setStyle(e.target.value)} className="rounded-md border border-border-default bg-surface-0 px-2 py-1.5 text-sm text-text-primary focus:outline-none">
            {styleOptions.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={() => act({ action: "style", style })} className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40">Change style default</button>
          <button type="button" disabled={busy} onClick={() => act({ action: "clear" })} className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-muted hover:border-destructive hover:text-destructive disabled:opacity-40">Clear to default</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a licensed image URL…" className="w-64 rounded-md border border-border-default bg-surface-0 px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none" />
          <button type="button" disabled={busy || !url.trim()} onClick={() => act({ action: "licensed", url: url.trim() })} className="rounded-md bg-brand-gold px-3 py-1.5 text-xs font-bold text-text-inverse disabled:opacity-40">Set as hero</button>
          {photos === null ? (
            <button type="button" onClick={loadPhotos} className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold">Choose from user photos</button>
          ) : photos.length === 0 ? (
            <span className="text-xs text-text-muted">No approved user photos.</span>
          ) : null}
        </div>
        {photos && photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={p.url} alt="" onClick={() => act({ action: "user_photo", url: p.url })} className="h-16 w-16 cursor-pointer rounded-md border border-border-subtle object-cover transition hover:ring-2 hover:ring-brand-gold" />
            ))}
          </div>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
    </div>
  );
}

function PreviewModal({ venue, mode, onClose, onResolved }: { venue: HubVenue; mode: PreviewMode; onClose: () => void; onResolved?: (id: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const needsEnrich = venue.lat === 0 && venue.lng === 0;
  const pending = venue.pending ?? {};
  const fields = venue.fields ?? {};
  const isPending = mode === "pending_copy";
  const hook = isPending ? ((pending.hook as string) ?? null) : venue.hook;
  const description = isPending ? ((pending.description as string) ?? null) : venue.description;
  const changed = isPending
    ? DIFF_FIELDS.filter(
        (f) =>
          Object.prototype.hasOwnProperty.call(pending, f.key) &&
          fmtVal(f.key, pending[f.key]) !== fmtVal(f.key, fields[f.key])
      )
    : [];
  const onRecord = DIFF_FIELDS.filter((f) => fmtVal(f.key, fields[f.key]) !== "—");

  async function act(fn: () => Promise<Response>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      // Clear the row's stale "Draft ready…" line so the published row updates
      // cleanly (§09.2.4).
      onResolved?.(venue.id);
      onClose();
      router.refresh();
    }
  }
  const approve = () => act(() => fetch("/api/admin/venues/approve-copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId: venue.id, action: "approve" }) }));
  const discard = () => act(() => fetch("/api/admin/venues/approve-copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId: venue.id, action: "discard" }) }));
  const publish = () => act(() => fetch("/api/admin/venues", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId: venue.id, status: "approved" }) }));
  const reject = () => act(() => fetch("/api/admin/venues", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId: venue.id, status: "rejected" }) }));

  const banner =
    mode === "pending_copy"
      ? { text: "Proposed copy — NOT yet live. This is what publishing will show.", cls: "border-brand-gold/40 bg-brand-gold/10 text-brand-gold" }
      : mode === "draft"
        ? { text: "Draft — not yet published. This is exactly what will go live.", cls: "border-brand-gold/40 bg-brand-gold/10 text-brand-gold" }
        : { text: "Currently published copy.", cls: "border-border-default bg-surface-1 text-text-secondary" };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border-strong bg-surface-0 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative h-48 w-full overflow-hidden rounded-t-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={venue.heroUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-0 to-transparent" />
          <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"><X className="h-4 w-4" /></button>
          <span className="absolute bottom-3 left-4 rounded-full bg-black/50 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-white">{venue.heroSourceLabel}</span>
        </div>
        <div className="p-6">
          <h3 className="font-heading text-2xl font-bold text-text-primary">{venue.name}{venue.location_label && <span className="ml-2 text-base font-normal text-brand-sienna-light">· {venue.location_label}</span>}</h3>
          <p className="mt-1 text-sm text-text-muted">{[venue.city, venue.country].filter(Boolean).join(", ") || "no location"} · {venue.styleLabel}</p>

          {/* Chain signal surfaced at the COPY-preview stage, not only at approve (§09.2.8). */}
          {venue.isChainParent && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-brand-sienna/40 bg-brand-sienna/10 px-2.5 py-0.5 text-xs font-semibold text-brand-sienna-light">
              <Store className="h-3 w-3" /> Part of a chain{venue.chainRostered ? " · roster scanned" : " — roster scan available after approve"}
            </p>
          )}

          <p className={`mt-3 rounded-md border px-3 py-1.5 text-xs ${banner.cls}`}>{banner.text}</p>

          {/* Why this venue needs attention (e.g. dossier too thin) — shown here
              so it's obvious why there may be no copy. */}
          {venue.needs_attention && venue.attention_reason && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-semibold">Needs attention. </span>
                {venue.attention_reason}
              </span>
            </div>
          )}

          {hook && <p className="mt-4 font-heading text-lg italic text-text-primary">{hook}</p>}
          {description ? (
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-text-secondary">
              {description.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-muted">
              No copy was written{venue.needs_attention ? " — see the note above" : " — run Enrich or Rewrite to generate it"}.
            </p>
          )}

          {/* Full change set — structured fields (§09.3) */}
          {isPending ? (
            <div className="mt-5 rounded-md border border-border-subtle bg-surface-1/40 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.05em] text-text-muted">
                Field changes ({changed.length})
              </p>
              {changed.length === 0 ? (
                <p className="text-xs text-text-muted">No structured field changes — copy only.</p>
              ) : (
                <div className="space-y-1.5">
                  {changed.map((f) => (
                    <div key={f.key} className="grid grid-cols-[92px_1fr] gap-2 text-xs">
                      <span className="font-semibold text-text-secondary">{f.label}</span>
                      <span className="min-w-0 break-words">
                        <span className="text-text-muted line-through">{fmtVal(f.key, fields[f.key])}</span>
                        <span className="mx-1.5 text-brand-gold">→</span>
                        <span className="text-text-primary">{fmtVal(f.key, pending[f.key])}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {(venue.hook || venue.description) && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-text-muted">Compare with current live copy</summary>
                  {venue.hook && <p className="mt-2 text-sm italic text-text-muted">{venue.hook}</p>}
                  {venue.description && <div className="mt-2 space-y-2 text-xs leading-relaxed text-text-muted">{venue.description.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>}
                </details>
              )}
            </div>
          ) : (
            onRecord.length > 0 && (
              <div className="mt-5 rounded-md border border-border-subtle bg-surface-1/40 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.05em] text-text-muted">On the record</p>
                <div className="space-y-1.5">
                  {onRecord.map((f) => (
                    <div key={f.key} className="grid grid-cols-[92px_1fr] gap-2 text-xs">
                      <span className="font-semibold text-text-secondary">{f.label}</span>
                      <span className="min-w-0 break-words text-text-primary">{fmtVal(f.key, fields[f.key])}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}

          <p className="mt-4 text-xs text-text-muted">{venue.hasIG ? "Instagram linked" : "No Instagram on file"}</p>

          {/* Decision buttons */}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-4">
            {mode === "pending_copy" && (
              <>
                <button type="button" onClick={discard} disabled={busy} className="rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-muted hover:border-destructive hover:text-destructive disabled:opacity-40">Discard</button>
                <button type="button" onClick={approve} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-brand-gold px-4 py-2 text-sm font-bold uppercase text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Approve all changes</button>
              </>
            )}
            {mode === "draft" && (
              <>
                <button type="button" onClick={reject} disabled={busy} className="rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-muted hover:border-destructive hover:text-destructive disabled:opacity-40">Decline</button>
                <button type="button" onClick={publish} disabled={busy || needsEnrich} title={needsEnrich ? "Enrich first (no map location)" : "Publish"} className="inline-flex items-center gap-1.5 rounded-md bg-brand-gold px-4 py-2 text-sm font-bold uppercase text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Publish</button>
              </>
            )}
            {mode === "live" && (
              <button type="button" onClick={onClose} className="rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary">Close</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
