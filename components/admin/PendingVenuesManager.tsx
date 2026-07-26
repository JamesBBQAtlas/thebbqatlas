"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Check,
  X,
  Loader2,
  Pause,
  Play,
  Square,
  AlertTriangle,
} from "lucide-react";
import { QuickPhotoInput } from "./QuickPhotoInput";

export interface DraftVenue {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  instagram_handle: string | null;
  hero_post_url: string | null;
  enriched_at: string | null;
  needs_attention: boolean;
  attention_reason: string | null;
  lat: number;
  lng: number;
  sourcesCount: number;
}

type RunState = "idle" | "queued" | "enriching" | "done" | "attention" | "error";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pending-venues queue with controlled BATCH enrichment. Multi-select +
 * "Enrich selected"; processed serially, one venue at a time (quality, no
 * parallel), with live per-venue status, a progress counter, and Pause/Stop that
 * halts after the current venue. Human Publish always required.
 */
export function PendingVenuesManager({ venues }: { venues: DraftVenue[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [country, setCountry] = useState("all");
  const [status, setStatus] = useState<Record<string, { state: RunState; msg?: string }>>(
    {}
  );
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ done: 0, attention: 0, total: 0 });
  const [rowBusy, setRowBusy] = useState<Record<string, "publish" | "reject">>({});
  const pauseRef = useRef(false);
  const stopRef = useRef(false);

  const countries = useMemo(
    () => [...new Set(venues.map((v) => v.country).filter(Boolean) as string[])].sort(),
    [venues]
  );
  const shown = useMemo(
    () => (country === "all" ? venues : venues.filter((v) => v.country === country)),
    [venues, country]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const selectAllShown = () => setSelected(new Set(shown.map((v) => v.id)));
  const clearSelection = () => setSelected(new Set());

  function setState(id: string, state: RunState, msg?: string) {
    setStatus((prev) => ({ ...prev, [id]: { state, msg } }));
  }

  async function enrichOne(id: string): Promise<RunState> {
    setState(id, "enriching");
    try {
      const res = await fetch("/api/admin/venues/enrich-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: id, mode: "full" }),
      });
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

  async function runBatch() {
    const ids = shown.filter((v) => selected.has(v.id)).map((v) => v.id);
    if (!ids.length || running) return;
    setRunning(true);
    setPaused(false);
    pauseRef.current = false;
    stopRef.current = false;
    let done = 0;
    let attention = 0;
    setProgress({ done: 0, attention: 0, total: ids.length });
    for (const id of ids) setState(id, "queued");

    for (const id of ids) {
      if (stopRef.current) break;
      while (pauseRef.current && !stopRef.current) await sleep(300);
      if (stopRef.current) break;
      const result = await enrichOne(id);
      if (result === "done") done++;
      else if (result === "attention") attention++;
      setProgress({ done, attention, total: ids.length });
    }
    setRunning(false);
    setPaused(false);
    router.refresh();
  }

  function togglePause() {
    pauseRef.current = !pauseRef.current;
    setPaused(pauseRef.current);
  }
  function stop() {
    stopRef.current = true;
    pauseRef.current = false;
    setPaused(false);
  }

  async function moderate(id: string, s: "approved" | "rejected") {
    setRowBusy((p) => ({ ...p, [id]: s === "approved" ? "publish" : "reject" }));
    const res = await fetch("/api/admin/venues", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: id, status: s }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setState(id, "error", data.error ?? "Failed");
      setRowBusy((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
    }
  }

  function pill(v: DraftVenue) {
    const rt = status[v.id]?.state;
    if (rt && rt !== "idle") {
      const map: Record<string, [string, string]> = {
        queued: ["Queued", "border-border-default text-text-muted"],
        enriching: ["Researching…", "border-brand-gold/50 bg-brand-gold/10 text-brand-gold"],
        done: ["Awaiting approval", "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"],
        attention: ["Needs attention", "border-amber-500/40 bg-amber-500/10 text-amber-400"],
        error: ["Error", "border-red-500/40 bg-red-500/10 text-red-400"],
      };
      const [label, cls] = map[rt];
      return { label, cls, spin: rt === "enriching" };
    }
    if (v.needs_attention)
      return { label: "Needs attention", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400", spin: false };
    if (v.enriched_at && !(v.lat === 0 && v.lng === 0))
      return { label: "Awaiting approval", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400", spin: false };
    if (v.enriched_at)
      return { label: "Enriched · no location", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400", spin: false };
    return { label: "Seeded", cls: "border-border-default text-text-muted", spin: false };
  }

  const selectedCount = shown.filter((v) => selected.has(v.id)).length;

  return (
    <div>
      {/* Batch toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface-0 p-4">
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary focus:border-brand-gold/60 focus:outline-none"
        >
          <option value="all">All countries ({venues.length})</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={selectAllShown}
          className="rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
        >
          Select all shown ({shown.length})
        </button>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={clearSelection}
            className="rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-muted transition-colors hover:text-text-primary"
          >
            Clear ({selected.size})
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {running ? (
            <>
              <span className="text-sm text-text-secondary">
                {progress.done + progress.attention} of {progress.total} ·{" "}
                {progress.attention} need attention
              </span>
              <button
                type="button"
                onClick={togglePause}
                className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
              >
                {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                onClick={stop}
                className="inline-flex items-center gap-1.5 rounded-md border border-destructive/60 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"
              >
                <Square className="h-3.5 w-3.5" /> Stop
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={runBatch}
              disabled={selectedCount === 0}
              className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" />
              Enrich selected ({selectedCount})
            </button>
          )}
        </div>
      </div>
      {running && (
        <p className="mb-4 text-xs text-text-muted">
          Processing one venue at a time to preserve quality. Pause/Stop halts
          after the current venue finishes — never mid-record.
        </p>
      )}

      {/* Rows */}
      <div className="space-y-3">
        {shown.map((v) => {
          const p = pill(v);
          const needsEnrich = v.lat === 0 && v.lng === 0;
          const rb = rowBusy[v.id];
          const busyRow = status[v.id]?.state === "enriching" || status[v.id]?.state === "queued";
          return (
            <div
              key={v.id}
              className="rounded-xl border border-border-subtle bg-surface-0 p-4"
            >
              <div className="flex flex-wrap items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(v.id)}
                  onChange={() => toggle(v.id)}
                  className="mt-1.5 h-4 w-4 shrink-0 accent-[#D4AF37]"
                  aria-label={`Select ${v.name}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-base font-bold text-text-primary">
                      {v.name}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.05em] ${p.cls}`}
                    >
                      {p.spin && <Loader2 className="h-3 w-3 animate-spin" />}
                      {p.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {[v.city, v.country].filter(Boolean).join(", ") || "no location"}
                    {v.instagram_handle && <> · @{v.instagram_handle}</>}
                    {v.hero_post_url && <> · hero ✓</>}
                    {v.sourcesCount > 0 && <> · {v.sourcesCount} sources</>}
                  </p>
                  {(v.attention_reason || status[v.id]?.msg) && (
                    <p className="mt-1 inline-flex items-start gap-1 text-xs text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {status[v.id]?.msg ?? v.attention_reason}
                    </p>
                  )}
                  <div className="mt-2">
                    <QuickPhotoInput restaurantId={v.id} current={v.hero_post_url} />
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => enrichOne(v.id)}
                    disabled={running || busyRow || Boolean(rb)}
                    className="inline-flex items-center gap-1 rounded-md border border-border-default px-3 py-1.5 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40"
                  >
                    {busyRow ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {v.enriched_at ? "Re-enrich" : "Enrich"}
                  </button>
                  <button
                    type="button"
                    onClick={() => moderate(v.id, "rejected")}
                    disabled={running || Boolean(rb)}
                    className="inline-flex items-center gap-1 rounded-md border border-border-default px-3 py-1.5 text-sm font-semibold text-text-muted transition-colors hover:border-destructive hover:text-destructive disabled:opacity-40"
                  >
                    {rb === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => moderate(v.id, "approved")}
                    disabled={running || Boolean(rb) || needsEnrich}
                    title={needsEnrich ? "Enrich this venue before publishing" : "Publish"}
                    className="inline-flex items-center gap-1 rounded-md bg-brand-gold px-3 py-1.5 text-sm font-bold uppercase tracking-[0.04em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
                  >
                    {rb === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Publish
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
