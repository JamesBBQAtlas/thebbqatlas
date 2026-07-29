"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle2, FileUp } from "lucide-react";

type Result = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  matchedExisting?: number;
  flaggedUncertain?: number;
  internalDupsCollapsed?: number;
  report?: string;
};

/**
 * Admin bulk venue import. Reads the seed sheet client-side, POSTs the raw CSV to
 * /api/admin/venues/import, and shows a summary. The server keeps only
 * type=venue & keep=Y rows and creates draft venues (idempotent on IG handle).
 */
export function VenueImportPanel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setResult(null);
    setError("");
    if (!f) {
      setFileName("");
      setCsv("");
      return;
    }
    setFileName(f.name);
    setCsv(await f.text());
  }

  async function runImport(dryRun: boolean) {
    if (!csv.trim() || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/venues/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
      } else {
        setResult(data as Result);
        // Keep the file loaded after a dry run so the real import is one click.
        if (!dryRun) {
          setFileName("");
          setCsv("");
          if (fileRef.current) fileRef.current.value = "";
          router.refresh();
        }
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-0 p-5">
      <div className="flex items-center gap-2">
        <FileUp className="h-4 w-4 text-brand-gold" />
        <h2 className="font-heading text-sm font-bold uppercase tracking-[0.06em] text-text-primary">
          Bulk import from seed sheet
        </h2>
      </div>
      <p className="mt-1.5 text-xs text-text-muted">
        CSV columns: instagram_handle, display_name, type, keep, venue_name, city,
        country, website, hero_post_url, notes. Only <code>type=venue</code> &{" "}
        <code>keep=Y</code> rows import, as drafts. Re-importing updates, never
        duplicates.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold">
          <Upload className="h-4 w-4" />
          {fileName || "Choose CSV…"}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="hidden"
          />
        </label>
        <button
          type="button"
          onClick={() => runImport(true)}
          disabled={!csv.trim() || busy}
          className="inline-flex items-center gap-2 rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          Dry run (preview)
        </button>
        <button
          type="button"
          onClick={() => runImport(false)}
          disabled={!csv.trim() || busy}
          className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Run a <strong>dry run</strong> first to preview the dedupe report — it writes nothing.
      </p>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {result && (
        <div className="mt-3 rounded-md border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-sm text-text-secondary">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" />
            <div className="space-y-1">
              <p className="font-semibold text-text-primary">Import report</p>
              <p>{result.report ?? `${result.created} created, ${result.updated} updated, ${result.skipped} skipped (of ${result.total} rows).`}</p>
              {(result.matchedExisting || result.flaggedUncertain) ? (
                <p className="text-xs text-text-muted">
                  {result.matchedExisting ?? 0} matched an existing venue and were <strong>not</strong> created (no duplicates).{" "}
                  {result.flaggedUncertain ?? 0} were created but flagged for review — find them under the Needs-attention filter.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
