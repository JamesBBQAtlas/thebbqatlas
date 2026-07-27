"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Upload, Loader2, Square, CheckCircle2 } from "lucide-react";
import { estimateCost, fmtUsd, BATCH_CONFIRM_THRESHOLD } from "@/lib/constants/enrichment-cost";

/**
 * "Import facts sheet" (§4): upload a completed dossier CSV → SKIP Grok → run
 * only the cheap Claude writing step → drafts for approval. Processed in batches
 * with live progress; shows the cost estimate up front.
 */
export function FactsImportPanel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [rowCount, setRowCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, created: 0, updated: 0, attention: 0, errors: 0 });
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const stopRef = useRef(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setResult(null);
    setError("");
    if (!f) {
      setCsv("");
      setFileName("");
      setRowCount(0);
      return;
    }
    const text = await f.text();
    setCsv(text);
    setFileName(f.name);
    // Rough row count for the estimate (non-empty lines minus header).
    const lines = text.split(/\r\n?|\n/).filter((l) => l.trim() !== "");
    setRowCount(Math.max(0, lines.length - 1));
  }

  const estimate = estimateCost("facts", rowCount);

  async function start() {
    setRunning(true);
    setConfirming(false);
    setError("");
    setResult(null);
    stopRef.current = false;
    let offset = 0;
    const acc = { done: 0, total: 0, created: 0, updated: 0, attention: 0, errors: 0 };
    try {
      while (!stopRef.current) {
        const res = await fetch("/api/admin/venues/import-facts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv, offset }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Import failed.");
          break;
        }
        acc.total = data.total;
        acc.done = data.nextOffset;
        acc.created += data.created;
        acc.updated += data.updated;
        acc.attention += data.attention;
        acc.errors += data.errors;
        setProgress({ ...acc });
        offset = data.nextOffset;
        if (data.done) {
          setResult(`${acc.created} created, ${acc.updated} updated, ${acc.attention} need attention${acc.errors ? `, ${acc.errors} errors` : ""}.`);
          break;
        }
      }
    } catch {
      setError("Network error — the run stopped. Re-run to continue.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  function onImportClick() {
    if (!csv.trim() || running) return;
    if (estimate >= BATCH_CONFIRM_THRESHOLD && !confirming) {
      setConfirming(true);
      return;
    }
    start();
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-0 p-5">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-brand-gold" />
        <h2 className="font-heading text-sm font-bold uppercase tracking-[0.06em] text-text-primary">
          Import facts sheet (skips Grok)
        </h2>
      </div>
      <p className="mt-1.5 text-xs text-text-muted">
        Upload a completed dossier CSV (columns = dossier fields + <code>why_blank</code>).
        We skip research and run only the cheap Claude writing step → drafts for approval.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold">
          <Upload className="h-4 w-4" />
          {fileName || "Choose facts CSV…"}
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
        </label>
        {rowCount > 0 && (
          <span className="text-xs text-text-muted">
            {rowCount} rows · est. <span className="font-semibold text-text-secondary">{fmtUsd(estimate)}</span>
          </span>
        )}
        {running ? (
          <button type="button" onClick={() => (stopRef.current = true)} className="inline-flex items-center gap-1.5 rounded-md border border-destructive/60 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10">
            <Square className="h-4 w-4" /> Stop
          </button>
        ) : (
          <button type="button" onClick={onImportClick} disabled={!csv.trim()} className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40">
            <Upload className="h-4 w-4" />
            {confirming ? `Confirm — spend ~${fmtUsd(estimate)}?` : "Import & write"}
          </button>
        )}
      </div>

      {running && (
        <p className="mt-3 text-sm text-text-secondary">
          Writing {progress.done} of {progress.total}… ({progress.created} created · {progress.attention} need attention)
        </p>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {result && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-brand-gold/40 bg-brand-gold/10 px-4 py-2.5 text-sm text-text-secondary">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-gold" />
          <span>{result} Drafts are in the hub for review.</span>
        </div>
      )}
    </div>
  );
}
