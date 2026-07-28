"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { freshness, FRESH_DOT } from "@/lib/admin/freshness";
import { estimateCost, fmtUsd, BATCH_CONFIRM_THRESHOLD, COST_PER_VENUE_CEILING } from "@/lib/constants/enrichment-cost";

export interface HubVenue {
  id: string;
  name: string;
  location_label: string | null;
  city: string | null;
  country: string | null;
  status: string;
  style: string;
  styleLabel: string;
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
  chainSeed: boolean;
  isChainParent: boolean;
  chainRostered: boolean;
  lat: number;
  lng: number;
}

type ActionKind = "enrich" | "rewrite" | "findig" | "publish" | "reject";
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
];

function fmtVal(key: string, val: unknown): string {
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
  { kind: "findig", label: "Find IG", icon: Instagram },
  { kind: "publish", label: "Publish", icon: Check },
  { kind: "reject", label: "Reject", icon: X },
];

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

async function callAction(id: string, kind: ActionKind): Promise<Response> {
  if (kind === "publish" || kind === "reject") {
    return fetch("/api/admin/venues", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId: id,
        status: kind === "publish" ? "approved" : "rejected",
      }),
    });
  }
  if (kind === "rewrite") {
    return fetchWithTimeout(
      "/api/admin/venues/rewrite",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId: id }) },
      240_000
    );
  }
  return fetchWithTimeout(
    "/api/admin/venues/enrich-draft",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: id, mode: kind === "findig" ? "light" : "full" }),
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
}: {
  venues: HubVenue[];
  styleOptions: { slug: string; label: string }[];
  initialStatus?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState(initialStatus);
  const [country, setCountry] = useState("all");
  const [photoF, setPhotoF] = useState("all"); // all | yes | no
  const [igF, setIgF] = useState("all");
  const [staleF, setStaleF] = useState(false);
  const [status, setStatus] = useState<Record<string, { state: RunState; msg?: string }>>({});
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ done: 0, attention: 0, total: 0, kind: "" as string });
  const [heroOpen, setHeroOpen] = useState<string | null>(null);
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

  const countries = useMemo(
    () => [...new Set(venues.map((v) => v.country).filter(Boolean) as string[])].sort(),
    [venues]
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return venues.filter((v) => {
      if (statusF !== "all" && v.status !== statusF) return false;
      if (country !== "all" && v.country !== country) return false;
      if (photoF === "yes" && !v.hasRealPhoto) return false;
      if (photoF === "no" && v.hasRealPhoto) return false;
      if (igF === "yes" && !v.hasIG) return false;
      if (igF === "no" && v.hasIG) return false;
      if (staleF && freshness(v.enriched_at).tone !== "red") return false;
      if (needle && !`${v.name} ${v.city ?? ""} ${v.country ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [venues, q, statusF, country, photoF, igF, staleF]);

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
  const selectAllShown = () => setSelected(new Set(shown.map((v) => v.id)));
  const clearSel = () => setSelected(new Set());
  const setState = (id: string, state: RunState, msg?: string) =>
    setStatus((p) => ({ ...p, [id]: { state, msg } }));

  async function runOne(id: string, kind: ActionKind): Promise<RunState> {
    setState(id, "running");
    try {
      const res = await callAction(id, kind);
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
    const ids = shown.filter((v) => selected.has(v.id)).map((v) => v.id);
    if (!ids.length || running) return;
    setRunning(true);
    setPaused(false);
    pauseRef.current = false;
    stopRef.current = false;
    let done = 0;
    let attention = 0;
    setProgress({ done: 0, attention: 0, total: ids.length, kind });
    for (const id of ids) setState(id, "queued");
    for (const id of ids) {
      if (stopRef.current) break;
      while (pauseRef.current && !stopRef.current) await sleep(300);
      if (stopRef.current) break;
      const r = await runOne(id, kind);
      if (r === "done") done++;
      else if (r === "attention") attention++;
      setProgress({ done, attention, total: ids.length, kind });
    }
    setRunning(false);
    setPaused(false);
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

  async function single(v: HubVenue, kind: ActionKind) {
    setRowResult((p) => ({ ...p, [v.id]: {} }));
    setState(v.id, "running");
    let res: Response;
    try {
      res = await callAction(v.id, kind);
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
    if (!res.ok) {
      setRowResult((p) => ({ ...p, [v.id]: { err: data.error ?? "Failed" } }));
      return;
    }
    if (kind === "findig") {
      setRowResult((p) => ({ ...p, [v.id]: { msg: `Found Instagram · ${data.posts ?? 0} posts` } }));
      router.refresh();
      return;
    }
    if (kind === "publish") {
      // Clear any stale enrich message ("Draft ready…") so a published row
      // never shows a draft line (§09.2.4).
      setRowResult((p) => ({ ...p, [v.id]: { msg: "Published ✓" } }));
      router.refresh();
      return;
    }
    if (kind === "reject") {
      setRowResult((p) => ({ ...p, [v.id]: { msg: v.status === "approved" ? "Unpublished" : "Declined" } }));
      router.refresh();
      return;
    }
    // enrich or rewrite
    const costNote = typeof data.cost === "number" ? ` · ${fmtUsd(data.cost)}` : "";
    // Chain detected on a PARENT enrich (§09.2). Siblings report is_chain:false,
    // so this never fires for them (loop fix). Skip the gateway if the chain has
    // already been rostered once.
    const sr = data.chain_seed_result as
      | { found: number; added: unknown[]; updated: unknown[]; matchedParent: number }
      | null
      | undefined;
    const seeds: { label: string; city: string | null }[] = Array.isArray(data.chain_seeds)
      ? data.chain_seeds
      : [];
    if (kind === "enrich" && data.is_chain && data.is_chain_parent && !data.chain_already_rostered) {
      setChainGateway({
        venueId: v.id,
        brand: data.brand ?? v.name,
        chainLocationsUrl: data.chain_locations_url ?? null,
        seeded: seeds,
        scanning: false,
        rostered: false,
        result: null,
      });
    }
    const chainNote =
      kind === "enrich" && data.is_chain
        ? sr
          ? ` · chain — ${sr.found} found · ${sr.added.length} new · ${sr.updated.length + sr.matchedParent} already present`
          : ` · part of a chain`
        : "";

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
            : "Draft ready — review & publish") + costNote + chainNote,
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
            result: `Roster scanned — ${summary} (${fmtUsd(data.cost ?? 0)}).`,
          }
        : g
    );
    router.refresh();
  }

  async function copyDecision(id: string, action: "approve" | "discard") {
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
        <button type="button" onClick={() => setStaleF((s) => !s)} className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${staleF ? "border-amber-500/60 bg-amber-500/10 text-amber-400" : "border-border-default text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"}`}>Stale only</button>
        <span className="text-xs text-text-muted">{shown.length} shown</span>
      </div>

      {/* Batch bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-border-subtle bg-surface-0 p-3">
        <button type="button" onClick={selectAllShown} className="rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold">Select all shown</button>
        {selected.size > 0 && <button type="button" onClick={clearSel} className="rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-muted hover:text-text-primary">Clear ({selected.size})</button>}
        <div className="mx-1 h-5 w-px bg-border-subtle" />
        {running ? (
          <>
            <span className="text-sm text-text-secondary">{progress.kind}: {progress.done + progress.attention} of {progress.total} · {progress.attention} need attention</span>
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
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-gold/50 bg-brand-gold/10 px-4 py-3">
          <span className="text-sm text-text-primary">
            This will run <strong>{confirmBatch.kind}</strong> on <strong>{confirmBatch.n}</strong> venues — estimated <strong>{fmtUsd(confirmBatch.est)}</strong>. Proceed?
          </span>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setConfirmBatch(null)} className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text-primary">Cancel</button>
            <button type="button" onClick={() => doBatch(confirmBatch.kind)} className="rounded-md bg-brand-gold px-3 py-1.5 text-xs font-bold uppercase text-text-inverse hover:bg-brand-gold/90">Confirm &amp; run</button>
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

      {/* Legend — what the row actions do */}
      <p className="mb-3 text-xs text-text-muted">
        <span className="font-semibold text-text-secondary">Actions:</span>{" "}
        <Sparkles className="inline h-3 w-3 align-[-2px]" /> Enrich (research + write) ·{" "}
        <PenLine className="inline h-3 w-3 align-[-2px]" /> Rewrite (re-word from saved research) ·{" "}
        <Instagram className="inline h-3 w-3 align-[-2px]" /> Find IG ·{" "}
        <ImageIcon className="inline h-3 w-3 align-[-2px]" /> Hero ·{" "}
        <Eye className="inline h-3 w-3 align-[-2px]" /> Preview the copy that will publish. On a
        live venue, new copy waits as <span className="text-brand-gold">pending copy</span> until
        you Approve it.
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border-subtle">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-1 text-xs uppercase tracking-[0.05em] text-text-muted">
            <tr>
              <th className="px-3 py-3"></th>
              <th className="px-3 py-3 font-semibold">Venue</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">📷</th>
              <th className="px-3 py-3 font-semibold">IG</th>
              <th className="px-3 py-3 font-semibold">Enriched</th>
              <th className="px-3 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((v) => {
              const rt = status[v.id]?.state;
              const busy = rt === "running" || rt === "queued";
              const f = freshness(v.enriched_at);
              const needsEnrich = v.lat === 0 && v.lng === 0;
              return (
                <Fragment key={v.id}>
                  <tr className="border-t border-border-subtle bg-surface-0 align-top">
                    <td className="px-3 py-3"><input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} className="mt-1 h-4 w-4 accent-[#D4AF37]" aria-label={`Select ${v.name}`} /></td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-text-primary">
                        {v.name}
                        {v.location_label && <span className="ml-1.5 text-xs font-normal text-brand-sienna-light">· {v.location_label}</span>}
                      </div>
                      <div className="text-xs text-text-muted">{[v.city, v.country].filter(Boolean).join(", ")} · {v.styleLabel}</div>
                      {v.needs_attention && v.attention_reason && (
                        <div className="mt-1 inline-flex items-start gap-1 text-xs text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{v.attention_reason}</div>
                      )}
                      {v.chainSeed && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {/* Status LABEL (not a button) — §09.2.10 */}
                          <span className="inline-flex items-center gap-1 rounded-full border border-brand-sienna/40 bg-brand-sienna/10 px-2 py-0.5 text-xs font-semibold text-brand-sienna-light">
                            Chain location · seed
                          </span>
                          {/* Distinct ACTION button */}
                          <button
                            type="button"
                            onClick={() => single(v, "enrich")}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded-md bg-brand-sienna px-2.5 py-1 text-xs font-bold uppercase text-text-inverse transition-colors hover:bg-brand-sienna/90 disabled:opacity-40"
                          >
                            <Sparkles className="h-3.5 w-3.5" />Enrich this location
                          </button>
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
                      {rt && rt !== "idle" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-gold">{busy && <Loader2 className="h-3 w-3 animate-spin" />}{rt === "running" ? "Working…" : rt === "queued" ? "Queued" : rt === "attention" ? "Attention" : rt === "error" ? (status[v.id]?.msg ?? "Error") : "Done"}</span>
                      ) : (
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
                      {v.cost > 0 && <span className="ml-1 text-text-secondary">· {fmtUsd(v.cost)}</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <IconBtn title="Re-research + rewrite (Grok researches, Claude writes)" busy={busy} onClick={() => single(v, "enrich")}><Sparkles className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn title="Rewrite copy from saved research (Claude only)" busy={busy} onClick={() => single(v, "rewrite")}><PenLine className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn title={v.hasIG ? "IG ✓ — re-run Find IG" : "Find IG (handle + recent posts)"} busy={busy} onClick={() => single(v, "findig")}>
                          <Instagram className={`h-3.5 w-3.5 ${v.hasIG ? "text-emerald-400" : ""}`} />
                        </IconBtn>
                        <IconBtn title="Hero image" onClick={() => setHeroOpen(heroOpen === v.id ? null : v.id)}><ImageIcon className="h-3.5 w-3.5" /></IconBtn>
                        <button type="button" onClick={() => setPreview(previewFromRow(v))} title="Read the copy that will publish" className="inline-flex items-center gap-1 rounded-md border border-border-strong px-2.5 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-brand-gold/60 hover:text-brand-gold">
                          <Eye className="h-3.5 w-3.5" />Preview
                        </button>
                        {v.status !== "approved" ? (
                          <>
                            <button type="button" onClick={() => single(v, "publish")} disabled={busy || needsEnrich} title={needsEnrich ? "Enrich first (no map location)" : "Publish"} className="inline-flex items-center gap-1 rounded-md bg-brand-gold px-2.5 py-1.5 text-xs font-bold uppercase text-text-inverse disabled:opacity-40">
                              <Check className="h-3.5 w-3.5" />Publish
                            </button>
                            <button type="button" onClick={() => single(v, "reject")} disabled={busy} title="Decline — remove from the queue" className="inline-flex items-center gap-1 rounded-md border border-border-default px-2.5 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-destructive hover:text-destructive disabled:opacity-40">
                              <X className="h-3.5 w-3.5" />Decline
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => single(v, "reject")} disabled={busy} title="Unpublish — pull this venue from the live site" className="inline-flex items-center gap-1 rounded-md border border-border-default px-2.5 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-destructive hover:text-destructive disabled:opacity-40">
                            <X className="h-3.5 w-3.5" />Unpublish
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
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

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

          <p className="mt-4 text-xs text-text-muted">{venue.hasIG ? `Instagram: ${venue.postsCount} post${venue.postsCount === 1 ? "" : "s"} on file` : "No Instagram on file"}</p>

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
