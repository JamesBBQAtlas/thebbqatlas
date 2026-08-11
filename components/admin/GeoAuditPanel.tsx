"use client";

import { useState } from "react";
import { Loader2, MapPin, AlertTriangle } from "lucide-react";

/** Shape returned by POST /api/admin/venues/geo-audit. */
interface AuditCounts {
  total: number;
  locked: number;
  ok: number;
  missing: number;
  incomplete: number;
  low_confidence: number;
  far: number;
  flagged: number;
  applied: number;
}
interface AuditResult {
  ok: boolean;
  mode: "dry-run" | "apply";
  counts: AuditCounts;
  postcode_checks: { run: number; skipped: number; cap: number; note: string | null };
  error?: string;
}

/** Shape returned by POST /api/admin/venues/geo-backfill. */
interface BackfillResult {
  ok: boolean;
  mode: "dry-run" | "apply";
  counts: {
    candidates_total: number;
    processed: number;
    updated: number;
    confirmed: number;
    approximate: number;
    geocode_calls: number;
    remaining: number;
  };
  note: string;
  error?: string;
}

/**
 * Item 2 (geocode-fix) — pin-sanity audit surface. Sweeps every venue and reports
 * a COUNT of pins that need a human: missing, incomplete address, low-confidence /
 * centroid, or implausibly far from their postcode. Dry-run first (changes
 * nothing); "Flag them" writes needs_attention so they surface in the queue. No
 * silent cap — the postcode-distance check reports how many it ran vs. skipped.
 */
export function GeoAuditPanel() {
  const [busy, setBusy] = useState<"" | "scan" | "apply">("");
  const [res, setRes] = useState<AuditResult | null>(null);
  const [err, setErr] = useState("");

  async function run(apply: boolean) {
    setBusy(apply ? "apply" : "scan");
    setErr("");
    try {
      const r = await fetch(`/api/admin/venues/geo-audit${apply ? "?apply=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apply ? { apply: true } : {}),
      });
      const d = (await r.json().catch(() => ({}))) as AuditResult;
      if (!r.ok) { setErr(d.error || "Audit failed."); return; }
      setRes(d);
    } catch {
      setErr("Network error.");
    } finally {
      setBusy("");
    }
  }

  // Item 3 — non-destructive confidence backfill for already-pinned venues.
  const [bfBusy, setBfBusy] = useState<"" | "scan" | "apply">("");
  const [bf, setBf] = useState<BackfillResult | null>(null);
  const [bfErr, setBfErr] = useState("");

  async function backfill(apply: boolean) {
    setBfBusy(apply ? "apply" : "scan");
    setBfErr("");
    try {
      const r = await fetch(`/api/admin/venues/geo-backfill${apply ? "?apply=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apply ? { apply: true } : {}),
      });
      const d = (await r.json().catch(() => ({}))) as BackfillResult;
      if (!r.ok) { setBfErr(d.error || "Backfill failed."); return; }
      setBf(d);
    } catch {
      setBfErr("Network error.");
    } finally {
      setBfBusy("");
    }
  }

  const c = res?.counts;
  const problems = c ? c.missing + c.incomplete + c.low_confidence + c.far : 0;
  const bc = bf?.counts;

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-0 p-5">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-brand-gold" />
        <span className="text-xs font-semibold uppercase tracking-[0.05em] text-text-muted">Pin-sanity audit</span>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-text-muted">
        Sweeps every venue for pins that need a human — missing, incomplete address, low-confidence / centroid, or implausibly far from their postcode. Locked (hand-placed) pins are trusted and skipped.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => run(false)}
          disabled={Boolean(busy)}
          className="inline-flex items-center gap-2 rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-50"
        >
          {busy === "scan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Run audit (dry-run)
        </button>
        {res && problems > 0 && (
          <button
            type="button"
            onClick={() => run(true)}
            disabled={Boolean(busy)}
            className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-400 hover:border-amber-500/60 disabled:opacity-50"
          >
            {busy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            Flag {problems} for review
          </button>
        )}
      </div>

      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}

      {c && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Total", value: c.total, tone: "text-text-primary" },
              { label: "Missing pin", value: c.missing, tone: "text-red-400" },
              { label: "Incomplete", value: c.incomplete, tone: "text-amber-400" },
              { label: "Low-confidence", value: c.low_confidence, tone: "text-amber-400" },
              { label: "Far from postcode", value: c.far, tone: "text-red-400" },
              { label: "Locked (trusted)", value: c.locked, tone: "text-emerald-400" },
            ].map((t) => (
              <div key={t.label} className="rounded-lg border border-border-subtle bg-surface-1 p-3">
                <div className={`font-heading text-2xl font-bold tabular-nums ${t.tone}`}>{t.value}</div>
                <div className="text-[0.6875rem] text-text-muted">{t.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-text-secondary">
            {res.mode === "apply"
              ? `Flagged ${c.applied} venue${c.applied === 1 ? "" : "s"} for review (needs_attention set).`
              : `${problems} venue${problems === 1 ? "" : "s"} need a human; ${c.ok} look fine.`}
            {res.postcode_checks.note ? <span className="text-text-muted"> · {res.postcode_checks.note}</span> : null}
          </p>
        </div>
      )}

      {/* Item 3 — confidence backfill for the existing pinned catalogue. */}
      <div className="mt-5 border-t border-border-subtle pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.05em] text-text-muted">Backfill pin confidence</p>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Confidence (the Confirmed / Approximate badge) is only recorded when a venue is geocoded, so pins placed before the geocode-fix read <span className="text-text-secondary">blank</span> until refreshed. This corroborates each already-pinned venue against a fresh geocode and fills its confidence in — <span className="text-text-secondary">without ever moving the pin</span>, and skipping locked pins. (The other path is simply “Flag for review → re-enrich”, which backfills confidence as a side effect.)
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => backfill(false)}
            disabled={Boolean(bfBusy)}
            className="inline-flex items-center gap-2 rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-50"
          >
            {bfBusy === "scan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Preview backfill (dry-run)
          </button>
          {bf && bc && bc.processed > 0 && (
            <button
              type="button"
              onClick={() => backfill(true)}
              disabled={Boolean(bfBusy)}
              className="inline-flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 hover:border-emerald-500/60 disabled:opacity-50"
            >
              {bfBusy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
              Backfill this batch
            </button>
          )}
        </div>
        {bfErr && <p className="mt-3 text-sm text-red-400">{bfErr}</p>}
        {bc && (
          <p className="mt-3 text-sm text-text-secondary">
            {bf!.mode === "apply"
              ? `Backfilled ${bc.updated} pin${bc.updated === 1 ? "" : "s"} (${bc.confirmed} confirmed · ${bc.approximate} approximate). `
              : `${bc.candidates_total} pinned venue${bc.candidates_total === 1 ? "" : "s"} need confidence; this batch would do ${bc.processed} (${bc.confirmed} confirmed · ${bc.approximate} to verify). `}
            <span className="text-text-muted">{bf!.note}</span>
          </p>
        )}
      </div>
    </div>
  );
}
