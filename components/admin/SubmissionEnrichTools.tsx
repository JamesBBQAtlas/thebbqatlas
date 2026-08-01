"use client";

import { useState } from "react";
import { Sparkles, Instagram, SquarePen, Check, X, Loader2, Store, Crown, AlertTriangle } from "lucide-react";
import { EditorPanel, type HubVenue } from "@/components/admin/VenueHub";
import { STYLE_OPTIONS } from "@/lib/admin/hub";

type Note = { msg?: string; warn?: string; err?: string };

async function postJson(url: string, body: unknown): Promise<{ res: Response; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, data };
}

/**
 * In-queue enrichment + editing for a public submission (post-launch QoL). On a
 * deliberate operator action the submission is materialised into a PENDING
 * (non-public) venue, then the EXACT Listings pipeline runs on it — Enrich,
 * Find IG, the full editor (copy + fields + tap-to-place pin), chain detection,
 * dedupe, geocode-flagging and the thin-data publish block — all reused, no
 * rebuild. Never auto-enriches; every AI call is a button the operator presses.
 */
export function SubmissionEnrichTools({
  submissionId,
  hasDuplicate,
  onResolved,
  onReject,
  onMerge,
}: {
  submissionId: string;
  hasDuplicate: boolean;
  onResolved: (id: string) => void;
  onReject: (id: string) => void;
  onMerge?: (id: string) => void;
}) {
  const [rid, setRid] = useState<string | null>(null);
  const [venue, setVenue] = useState<HubVenue | null>(null);
  const [busy, setBusy] = useState<null | string>(null);
  const [note, setNote] = useState<Note>({});
  const [showEditor, setShowEditor] = useState(false);
  const [copy, setCopy] = useState<{ hook: string | null; description: string | null } | null>(null);

  async function loadVenue(id: string) {
    try {
      const res = await fetch(`/api/admin/venues/hub?id=${id}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.venue) setVenue(data.venue as HubVenue);
    } catch {
      /* ignore */
    }
  }

  // Materialise on demand (idempotent server-side). Returns the venue id or null.
  async function ensureVenue(): Promise<string | null> {
    if (rid) return rid;
    const { res, data } = await postJson("/api/admin/submissions/materialize", { submissionId });
    if (!res.ok || !data.restaurantId) {
      setNote({ err: (data.error as string) ?? "Couldn't prepare this submission." });
      return null;
    }
    setRid(data.restaurantId as string);
    if (data.venue) setVenue(data.venue as HubVenue);
    return data.restaurantId as string;
  }

  async function enrich() {
    setBusy("enrich");
    setNote({});
    const id = await ensureVenue();
    if (!id) { setBusy(null); return; }
    const { res, data } = await postJson("/api/admin/venues/enrich-draft", { restaurantId: id, mode: "full", useExisting: true });
    setBusy(null);
    if (!res.ok) { setNote({ err: (data.error as string) ?? "Enrich failed." }); return; }
    const c = (data.copy as { hook: string | null; description: string | null } | undefined) ?? null;
    setCopy(c);
    if (data.needs_attention && !data.has_copy) {
      setNote({ warn: `Needs attention — ${(data.attention_reason as string) ?? "dossier too thin"}. Can't publish without override.` });
    } else if (data.chain_candidate) {
      setNote({ msg: "Enriched · looks like a chain — Build roster to add its locations." });
    } else {
      setNote({ msg: `Enriched${typeof data.cost === "number" ? ` · $${(data.cost as number).toFixed(3)}` : ""}. Review, then Approve & publish.` });
    }
    await loadVenue(id);
  }

  async function findIg() {
    setBusy("findig");
    setNote({});
    const id = await ensureVenue();
    if (!id) { setBusy(null); return; }
    const { res, data } = await postJson("/api/admin/venues/enrich-draft", { restaurantId: id, mode: "light" });
    setBusy(null);
    if (!res.ok) { setNote({ err: (data.error as string) ?? "Find IG failed." }); return; }
    // No post COUNT — a saved handle with 0 stored posts is not a dead account
    // (we link out, we don't mirror feeds), so "0 posts" would mislead.
    setNote(data.saved_ig
      ? { msg: `Instagram saved${data.handle ? ` · @${data.handle}` : ""}` }
      : { warn: "No Instagram found" });
    await loadVenue(id);
  }

  async function chainAction(url: string, label: string) {
    if (!rid) return;
    setBusy(label);
    setNote({});
    const { res, data } = await postJson(url, { restaurantId: rid });
    setBusy(null);
    if (!res.ok) { setNote({ err: (data.error as string) ?? "Failed." }); return; }
    setNote({ msg: (data.message as string) ?? (data.summary as string) ?? "Done." });
    await loadVenue(rid);
  }

  // Approve & publish — routes through the moderation endpoint, which publishes
  // the materialised venue under the same thin-data block as Listings (or does
  // the raw approve when the operator chose not to enrich). Handles the override.
  async function approve(override = false) {
    setBusy("approve");
    setNote({});
    const { res, data } = await postJson("/api/admin/moderate", {
      type: "submission",
      id: submissionId,
      action: "approve",
      override,
    });
    setBusy(null);
    if (res.status === 422 && data.needs_override) {
      const ok = typeof window !== "undefined" && window.confirm(`${data.error}\n\nThis submission is flagged for attention. Publish it anyway?`);
      if (ok) return approve(true);
      setNote({ warn: "Held — flagged for attention. Fix it in the editor or reject it." });
      return;
    }
    if (!res.ok) { setNote({ err: (data.error as string) ?? "Approve failed." }); return; }
    onResolved(submissionId);
  }

  const flagState = venue;
  const showBuildRoster = flagState?.chainCandidate && !flagState?.chainRostered && !flagState?.flagshipUnset;
  const showSetFlagship = flagState?.flagshipUnset;

  return (
    <div className="mt-4 border-t border-border-subtle pt-4">
      {/* Research + edit tools (reused from Listings) */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={enrich} disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-sienna px-3 py-1.5 text-xs font-bold uppercase tracking-[0.04em] text-text-inverse transition-colors hover:bg-brand-sienna/90 disabled:opacity-40">
          {busy === "enrich" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Enrich
        </button>
        <button type="button" onClick={findIg} disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40">
          {busy === "findig" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Instagram className={`h-3.5 w-3.5 ${venue?.hasIG ? "text-emerald-400" : ""}`} />}Find IG
        </button>
        <button type="button" onClick={async () => { const id = await ensureVenue(); if (id) { if (!venue) await loadVenue(id); setShowEditor((v) => !v); } }} disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40">
          <SquarePen className="h-3.5 w-3.5" />{showEditor ? "Hide editor" : "Edit"}
        </button>
        {showBuildRoster && (
          <button type="button" onClick={() => chainAction("/api/admin/venues/chain-roster", "roster")} disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold uppercase text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40">
            {busy === "roster" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Store className="h-3.5 w-3.5" />}Build roster
          </button>
        )}
        {showSetFlagship && (
          <button type="button" onClick={() => chainAction("/api/admin/venues/set-flagship", "flagship")} disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-brand-gold/50 bg-brand-gold/10 px-3 py-1.5 text-xs font-bold uppercase text-brand-gold hover:bg-brand-gold/20 disabled:opacity-40">
            {busy === "flagship" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crown className="h-3.5 w-3.5" />}Set as flagship
          </button>
        )}
      </div>

      {note.msg && <p className="mt-2 text-xs text-emerald-400">{note.msg}</p>}
      {note.warn && <p className="mt-2 inline-flex items-start gap-1 text-xs text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{note.warn}</p>}
      {note.err && <p className="mt-2 text-xs text-destructive">{note.err}</p>}

      {/* Enriched copy preview */}
      {(copy?.hook || copy?.description) && !showEditor && (
        <div className="mt-3 rounded-md border border-border-subtle bg-surface-1/40 p-3">
          {copy?.hook && <p className="font-heading text-sm italic text-text-primary">{copy.hook}</p>}
          {copy?.description && (
            <div className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-text-secondary">
              {copy.description.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Full editor — the exact Listings EditorPanel, reused */}
      {showEditor && venue && (
        <div className="mt-3 rounded-md border border-border-subtle bg-surface-1/30 p-3">
          <EditorPanel
            venue={venue}
            styleOptions={STYLE_OPTIONS}
            flagshipChoices={[]}
            onDone={() => rid && loadVenue(rid)}
            onDelete={async () => {
              if (!rid) return;
              await postJson("/api/admin/venues/delete", { restaurantId: rid });
              setRid(null); setVenue(null); setShowEditor(false);
              setNote({ warn: "Pending venue discarded — Enrich again to recreate it, or Reject the submission." });
            }}
            onDetach={async () => { if (rid) { await postJson("/api/admin/venues/chain", { restaurantId: rid, action: "detach" }); loadVenue(rid); } }}
            onAttach={async (pid) => { if (rid) { await postJson("/api/admin/venues/chain", { restaurantId: rid, action: "attach", parentId: pid }); loadVenue(rid); } }}
            onFlag={async (patch) => { if (rid) { await postJson("/api/admin/venues/flags", { restaurantId: rid, ...patch }); loadVenue(rid); } }}
          />
        </div>
      )}

      {/* Decision */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => approve(false)} disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-gold px-3.5 py-2 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40">
          {busy === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{rid ? "Approve & publish" : hasDuplicate ? "Approve as new" : "Approve"}
        </button>
        {hasDuplicate && onMerge && (
          <button type="button" onClick={() => onMerge(submissionId)} disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-brand-gold/50 px-3 py-2 text-xs font-semibold text-brand-gold transition-colors hover:bg-brand-gold/10 disabled:opacity-40">
            Merge into existing
          </button>
        )}
        <button type="button" onClick={() => onReject(submissionId)} disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-destructive hover:text-destructive disabled:opacity-40">
          <X className="h-3.5 w-3.5" />Reject
        </button>
      </div>
      {rid && (
        <p className="mt-2 text-[0.6875rem] text-text-muted">Prepared as a pending (non-public) venue — nothing is live until you approve.</p>
      )}
    </div>
  );
}
