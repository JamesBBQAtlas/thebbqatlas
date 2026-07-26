"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle2, FileUp } from "lucide-react";

type Result = { total: number; created: number; updated: number; skipped: number };

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

  async function runImport() {
    if (!csv.trim() || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/venues/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
      } else {
        setResult(data as Result);
        setFileName("");
        setCsv("");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
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
          onClick={runImport}
          disabled={!csv.trim() || busy}
          className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Importing…" : "Import"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {result && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-brand-gold/40 bg-brand-gold/10 px-4 py-2.5 text-sm text-text-secondary">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-gold" />
          <span>
            <strong className="text-text-primary">{result.created}</strong> created,{" "}
            <strong className="text-text-primary">{result.updated}</strong> updated,{" "}
            {result.skipped} skipped (of {result.total} rows). Drafts are below.
          </span>
        </div>
      )}
    </div>
  );
}
