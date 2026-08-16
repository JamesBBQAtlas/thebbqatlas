"use client";

import { useState } from "react";
import { Loader2, Globe, AlertTriangle, Check } from "lucide-react";

/** Shape returned by POST /api/admin/venues/country-backfill. */
interface BackfillResult {
  ok: boolean;
  mode: "dry-run" | "apply";
  scanned: number;
  would_map: number;
  updated: number;
  mapped: { from: string; to: string; count: number }[];
  needs_review: { value: string; count: number }[];
  note: string;
  error?: string;
}

/**
 * Country-normalize backfill surface. Sweeps the catalogue for non-canonical
 * country values ("MX" → Mexico, "Deutschland" → Germany) and maps them to the
 * one canonical name. Preview (dry-run) first — it changes nothing and lists both
 * the confident maps AND anything it WON'T touch (unknown, or the ambiguous
 * "Georgia"). "Apply" writes only the confident maps; the review list is left for
 * a human to fix in the venue editor.
 */
export function CountryBackfillPanel() {
  const [busy, setBusy] = useState<"" | "scan" | "apply">("");
  const [res, setRes] = useState<BackfillResult | null>(null);
  const [err, setErr] = useState("");

  async function run(apply: boolean) {
    setBusy(apply ? "apply" : "scan");
    setErr("");
    try {
      const r = await fetch(`/api/admin/venues/country-backfill${apply ? "?apply=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apply ? { apply: true } : {}),
      });
      const d = (await r.json().catch(() => ({}))) as BackfillResult;
      if (!r.ok) { setErr(d.error || "Backfill failed."); return; }
      setRes(d);
    } catch {
      setErr("Network error.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-0 p-5">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-brand-gold" />
        <span className="text-xs font-semibold uppercase tracking-[0.05em] text-text-muted">Country names</span>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-text-muted">
        Maps any non-canonical country value (an ISO code like <span className="text-text-secondary">MX</span>, a
        native name like <span className="text-text-secondary">Deutschland</span>) to the single canonical name, so the
        country totals group cleanly. Preview first — it lists the confident maps and anything it won&apos;t touch
        (unknown, or the ambiguous <span className="text-text-secondary">&ldquo;Georgia&rdquo;</span>, which is both a
        country and a US state). Apply writes only the confident maps.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => run(false)}
          disabled={Boolean(busy)}
          className="inline-flex items-center gap-2 rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-50"
        >
          {busy === "scan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Preview (dry-run)
        </button>
        {res && res.mapped.length > 0 && (
          <button
            type="button"
            onClick={() => run(true)}
            disabled={Boolean(busy)}
            className="inline-flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 hover:border-emerald-500/60 disabled:opacity-50"
          >
            {busy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Apply {res.would_map} mapping{res.would_map === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}

      {res && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-text-secondary">
            {res.mode === "apply"
              ? `Mapped ${res.updated} row${res.updated === 1 ? "" : "s"} to canonical country names.`
              : `Scanned ${res.scanned} venue${res.scanned === 1 ? "" : "s"}; ${res.would_map} would be mapped.`}
            <span className="text-text-muted"> · {res.note}</span>
          </p>

          {res.mapped.length > 0 && (
            <div className="rounded-lg border border-border-subtle bg-surface-1 p-3">
              <div className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted">
                {res.mode === "apply" ? "Mapped" : "Would map"}
              </div>
              <ul className="space-y-1 text-sm text-text-secondary">
                {res.mapped.map((m) => (
                  <li key={`${m.from}->${m.to}`} className="flex items-center gap-2">
                    <span className="rounded bg-surface-0 px-1.5 py-0.5 font-mono text-xs text-text-primary">{m.from}</span>
                    <span className="text-text-muted">→</span>
                    <span className="font-semibold text-text-primary">{m.to}</span>
                    <span className="text-text-muted">· {m.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {res.needs_review.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-amber-400">
                <AlertTriangle className="h-3 w-3" />Left for you — verify by hand
              </div>
              <ul className="space-y-1 text-sm text-amber-300/90">
                {res.needs_review.map((r) => (
                  <li key={r.value} className="flex items-center gap-2">
                    <span className="rounded bg-surface-0 px-1.5 py-0.5 font-mono text-xs text-text-primary">{r.value}</span>
                    <span className="text-text-muted">· {r.count} · unknown or ambiguous — set it in the venue editor</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
