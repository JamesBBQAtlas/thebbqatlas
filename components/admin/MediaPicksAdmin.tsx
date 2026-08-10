"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Plus, ImageDown, Youtube, Pencil, X, Sparkles } from "lucide-react";
import { findDuplicateByUrl, detectMediaKind } from "@/lib/media/wrl-url";

export interface AdminMediaPick {
  id: string;
  kind: "youtube" | "book" | "podcast" | "video";
  name: string;
  creator: string | null;
  url: string;
  blurb: string;
  image_url: string | null;
  gear_link: string | null;
  links: Record<string, string> | null;
  sort_order: number;
  is_published: boolean;
  // Part C — link health.
  link_status?: "ok" | "broken" | "redirected" | "unchecked" | null;
  link_note?: string | null;
  link_checked_at?: string | null;
}

/** Part B — the three public sections; Watch bundles channels + episodes. */
type Section = "watch" | "read" | "listen";
const SECTION_KINDS: Record<Section, AdminMediaPick["kind"][]> = {
  watch: ["youtube", "video"],
  read: ["book"],
  listen: ["podcast"],
};
const SECTION_LABEL: Record<Section, string> = { watch: "Watch", read: "Read", listen: "Listen" };

const KIND_LABEL: Record<AdminMediaPick["kind"], string> = {
  youtube: "Watch — YouTube channels",
  video: "Watch — Episodes We Love",
  book: "Read — Books",
  podcast: "Listen — Podcasts",
};
const KINDS: AdminMediaPick["kind"][] = ["youtube", "video", "book", "podcast"];

const inputCls =
  "w-full rounded-md border border-border-default bg-surface-1 px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none";

async function api(method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>) {
  const res = await fetch("/api/admin/media-picks", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: data.error as string | undefined };
}

/** Part C — run the link-health checker for a set of ids (or the whole library). */
async function checkLinks(ids?: string[]) {
  const res = await fetch("/api/admin/media-picks/check-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ids ? { ids } : {}),
  });
  return res.json().catch(() => ({}));
}

/** A small link-health badge (Part C). */
function LinkHealthBadge({ status, note }: { status?: string | null; note?: string | null }) {
  const s = status ?? "unchecked";
  const map: Record<string, { cls: string; label: string }> = {
    ok: { cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400", label: "OK" },
    broken: { cls: "border-destructive/50 bg-destructive/10 text-destructive", label: "Broken" },
    redirected: { cls: "border-amber-500/40 bg-amber-500/10 text-amber-400", label: "Redirected" },
    unchecked: { cls: "border-border-default bg-surface-1 text-text-muted", label: "Unchecked" },
  };
  const m = map[s] ?? map.unchecked;
  return (
    <span
      title={note ?? undefined}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.05em] ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function Row({ pick, onEdit }: { pick: AdminMediaPick; onEdit: (p: AdminMediaPick) => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState(pick);
  const initialLinks = JSON.stringify(pick.links ?? {}, null, 0);
  const [linksText, setLinksText] = useState(initialLinks);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty =
    draft.name !== pick.name ||
    draft.creator !== pick.creator ||
    draft.url !== pick.url ||
    draft.blurb !== pick.blurb ||
    draft.sort_order !== pick.sort_order ||
    draft.image_url !== pick.image_url ||
    draft.gear_link !== pick.gear_link ||
    linksText !== initialLinks;

  async function run(method: "PATCH" | "DELETE", payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const { ok, error } = await api(method, payload);
    setBusy(false);
    if (!ok) return setError(error || "Failed.");
    router.refresh();
  }

  async function recheck() {
    setBusy(true);
    await checkLinks([pick.id]);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border-default bg-surface-0 p-4">
      {/* Part B — scannable header: thumbnail, name/creator, link-health, open. */}
      <div className="mb-3 flex items-center gap-3">
        {draft.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={draft.image_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface-2 text-text-muted">
            <ImageDown className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">{pick.name || "Untitled"}</p>
          <p className="truncate text-xs text-text-muted">{pick.creator ?? ""}</p>
        </div>
        <LinkHealthBadge status={pick.link_status} note={pick.link_note} />
        <a
          href={pick.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs font-semibold text-brand-gold hover:underline"
        >
          Open ↗
        </a>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem]">
        <input
          className={inputCls}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Name"
        />
        <input
          className={inputCls}
          value={draft.creator ?? ""}
          onChange={(e) => setDraft({ ...draft, creator: e.target.value })}
          placeholder="Creator (optional)"
        />
        <input
          className={inputCls}
          type="number"
          value={draft.sort_order}
          onChange={(e) => setDraft({ ...draft, sort_order: parseInt(e.target.value, 10) || 0 })}
          placeholder="Order"
        />
      </div>
      <input
        className={inputCls + " mt-2"}
        value={draft.url}
        onChange={(e) => setDraft({ ...draft, url: e.target.value })}
        placeholder="URL"
      />
      <textarea
        className={inputCls + " mt-2 resize-none"}
        rows={2}
        value={draft.blurb}
        onChange={(e) => setDraft({ ...draft, blurb: e.target.value })}
        placeholder="Blurb"
      />
      <input
        className={inputCls + " mt-2"}
        value={draft.image_url ?? ""}
        onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
        placeholder="Image URL (optional — books auto-fill via Resolve book covers)"
      />
      <input
        className={inputCls + " mt-2"}
        value={draft.gear_link ?? ""}
        onChange={(e) => setDraft({ ...draft, gear_link: e.target.value })}
        placeholder="Gear link (optional → /gear)"
      />
      <textarea
        className={inputCls + " mt-2 resize-none font-mono text-xs"}
        rows={2}
        value={linksText}
        onChange={(e) => setLinksText(e.target.value)}
        placeholder={`Platform links JSON (podcasts) — e.g. {"apple":"…","spotify":"…"}`}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() =>
            run("PATCH", {
              id: pick.id,
              name: draft.name,
              creator: draft.creator,
              url: draft.url,
              blurb: draft.blurb,
              image_url: draft.image_url,
              gear_link: draft.gear_link,
              links: linksText,
              sort_order: draft.sort_order,
            })
          }
          className="rounded-md bg-brand-gold px-3 py-1.5 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run("PATCH", { id: pick.id, is_published: !pick.is_published })}
          className={
            "rounded-md border px-3 py-1.5 text-xs font-semibold " +
            (pick.is_published
              ? "border-brand-gold/60 text-brand-gold"
              : "border-border-default text-text-muted")
          }
        >
          {pick.is_published ? "Published" : "Draft"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={recheck}
          className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-muted hover:border-brand-gold/60 hover:text-brand-gold"
          title="Re-check this link's health"
        >
          Re-check link
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onEdit(pick)}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border-default px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
          title="Open the full editor (with URL auto-fetch)"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirm(`Delete "${pick.name}"?`)) run("DELETE", { id: pick.id });
          }}
          className="inline-flex items-center gap-1 rounded-md border border-border-default px-2.5 py-1.5 text-xs font-semibold text-text-muted hover:border-destructive/60 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />}
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Which WRL kinds each section can add (Watch offers channels OR episodes). */
const SECTION_ADD_KINDS: Record<Section, AdminMediaPick["kind"][]> = {
  watch: ["youtube", "video"],
  read: ["book"],
  listen: ["podcast"],
};
const KIND_ADD_LABEL: Record<AdminMediaPick["kind"], string> = {
  youtube: "YouTube channel",
  video: "Episode (single video)",
  book: "Book",
  podcast: "Podcast",
};
const KIND_URL_HINT: Record<AdminMediaPick["kind"], string> = {
  youtube: "Paste the channel URL (youtube.com/@handle or /channel/UC…)",
  video: "Paste a YouTube video URL (watch / youtu.be / shorts)",
  book: "Paste the Amazon product page URL",
  podcast: "Paste the Apple Podcasts (or Spotify) show URL",
};

export type ModalState =
  | { mode: "add"; kind: AdminMediaPick["kind"] }
  | { mode: "edit"; pick: AdminMediaPick };

/**
 * Part B (B4) — the add/edit modal. One panel for both adding a new pick and
 * editing an existing one, with **URL auto-fetch**: paste a link, hit "Fetch",
 * and the server fills name/creator/avatar (channel) / cover (book) / artwork
 * (podcast) / title+thumb (episode). The blurb is always hand-written. A live
 * **duplicate guard** warns before you add a URL that's already in the library.
 * Books keep their raw Amazon URL (the affiliate tag is applied only at render).
 */
function MediaPickModal({
  state,
  allRows,
  onClose,
}: {
  state: ModalState;
  allRows: AdminMediaPick[];
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = state.mode === "edit";
  const seed = isEdit ? state.pick : null;

  const [kind, setKind] = useState<AdminMediaPick["kind"]>(isEdit ? seed!.kind : state.kind);
  const [url, setUrl] = useState(seed?.url ?? "");
  const [name, setName] = useState(seed?.name ?? "");
  const [creator, setCreator] = useState(seed?.creator ?? "");
  const [blurb, setBlurb] = useState(seed?.blurb ?? "");
  const [imageUrl, setImageUrl] = useState(seed?.image_url ?? "");
  const [gearLink, setGearLink] = useState(seed?.gear_link ?? "");
  const [linksText, setLinksText] = useState(JSON.stringify(seed?.links ?? {}, null, 0));
  const [published, setPublished] = useState(seed?.is_published ?? true);
  const [fetching, setFetching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Live duplicate guard — skip the row being edited.
  const dup = url.trim() ? findDuplicateByUrl(url, allRows, seed?.id) : null;
  // The three sections keep their own kinds; Watch can switch youtube↔video.
  const addKinds = isEdit ? [kind] : SECTION_ADD_KINDS[
    (Object.keys(SECTION_ADD_KINDS) as Section[]).find((s) => SECTION_ADD_KINDS[s].includes(kind)) ?? "watch"
  ];

  async function fetchMeta() {
    if (!url.trim()) return;
    setFetching(true);
    setError("");
    setWarnings([]);
    try {
      const res = await fetch("/api/admin/media-picks/resolve-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.error as string) || "Couldn't read that URL.");
        return;
      }
      const row = (data.row ?? {}) as Partial<AdminMediaPick> & { links?: Record<string, string> };
      if (row.kind && !isEdit) setKind(row.kind as AdminMediaPick["kind"]);
      if (row.url) setUrl(row.url);
      // Fill empties; don't stomp anything the operator already typed.
      if (row.name) setName((v) => v || String(row.name));
      if (row.creator) setCreator((v) => v || String(row.creator));
      if (row.image_url) setImageUrl(String(row.image_url));
      if (row.links && Object.keys(row.links).length) setLinksText(JSON.stringify(row.links, null, 0));
      setWarnings(Array.isArray(data.warnings) ? (data.warnings as string[]) : []);
    } catch {
      setError("Network error.");
    } finally {
      setFetching(false);
    }
  }

  const canSave = Boolean(name.trim() && url.trim() && blurb.trim()) && !busy;

  async function save() {
    setBusy(true);
    setError("");
    const payload: Record<string, unknown> = {
      kind,
      name: name.trim(),
      creator: creator.trim() || undefined,
      url: url.trim(),
      blurb: blurb.trim(),
      image_url: imageUrl.trim() || undefined,
      gear_link: gearLink.trim() || undefined,
      links: linksText.trim() || "{}",
      is_published: published,
    };
    let res: { ok: boolean; error?: string };
    if (isEdit) {
      payload.id = seed!.id;
      res = await api("PATCH", payload);
    } else {
      res = await api("POST", payload);
    }
    setBusy(false);
    if (!res.ok) return setError(res.error || "Failed to save.");
    onClose();
    router.refresh();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit library item" : "Add to the library"}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl rounded-xl border border-border-default bg-surface-0 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-text-primary">
            {isEdit ? "Edit item" : "Add to the library"}
          </h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-text-muted hover:text-text-primary" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Kind picker (add only) */}
        {!isEdit && addKinds.length > 1 && (
          <div className="mb-3 inline-flex gap-1 rounded-lg border border-border-subtle bg-surface-1 p-1">
            {addKinds.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={
                  "rounded-md px-2.5 py-1 text-xs font-semibold " +
                  (kind === k ? "bg-brand-gold text-text-inverse" : "text-text-secondary hover:text-text-primary")
                }
              >
                {KIND_ADD_LABEL[k]}
              </button>
            ))}
          </div>
        )}

        {/* URL + auto-fetch */}
        <label className="block text-xs font-semibold text-text-muted">Link</label>
        <div className="mt-1 flex gap-2">
          <input
            ref={firstFieldRef}
            className={inputCls}
            value={url}
            onChange={(e) => { setUrl(e.target.value); if (!isEdit) { const k = detectMediaKind(e.target.value); if (k && SECTION_ADD_KINDS[(Object.keys(SECTION_ADD_KINDS) as Section[]).find((s) => SECTION_ADD_KINDS[s].includes(kind)) ?? "watch"].includes(k)) setKind(k); } }}
            placeholder={KIND_URL_HINT[kind]}
          />
          <button
            type="button"
            disabled={fetching || !url.trim()}
            onClick={fetchMeta}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40"
            title="Auto-fill name, creator and image from this URL"
          >
            {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Fetch
          </button>
        </div>

        {/* Duplicate guard */}
        {dup && (
          <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-400">
            Already in the library as “{dup.name}” ({KIND_ADD_LABEL[dup.kind]}). Adding it again will create a duplicate.
          </p>
        )}

        {/* Preview + fields */}
        <div className="mt-3 flex gap-3">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-16 w-16 shrink-0 rounded object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-surface-2 text-text-muted">
              {kind === "youtube" || kind === "video" ? <Youtube className="h-5 w-5" /> : <ImageDown className="h-5 w-5" />}
            </span>
          )}
          <div className="grid flex-1 gap-2">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name / title" />
            <input className={inputCls} value={creator} onChange={(e) => setCreator(e.target.value)} placeholder={kind === "book" ? "Author" : kind === "podcast" ? "Publisher" : "Creator / channel"} />
          </div>
        </div>

        <textarea
          className={inputCls + " mt-2 resize-none"}
          rows={2}
          value={blurb}
          onChange={(e) => setBlurb(e.target.value)}
          placeholder="Blurb — written in-house, in the site voice (required)"
        />

        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-text-muted hover:text-text-secondary">More fields</summary>
          <div className="mt-2 space-y-2">
            <input className={inputCls} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Image URL (auto-filled by Fetch)" />
            <input className={inputCls} value={gearLink} onChange={(e) => setGearLink(e.target.value)} placeholder="Gear link (optional → /gear)" />
            <textarea
              className={inputCls + " resize-none font-mono text-xs"}
              rows={2}
              value={linksText}
              onChange={(e) => setLinksText(e.target.value)}
              placeholder={`Platform links JSON — e.g. {"apple":"…","spotify":"…"}`}
            />
          </div>
        </details>

        <label className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="h-3.5 w-3.5" />
          Published (unchecked = draft, hidden from the public page)
        </label>

        {warnings.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-amber-400">
            {warnings.map((w, i) => <li key={i}>• {w}</li>)}
          </ul>
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={!canSave}
            onClick={save}
            className="rounded-md bg-brand-gold px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isEdit ? "Save changes" : "Add to library"}
          </button>
          <button type="button" onClick={onClose} className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-muted">
            Cancel
          </button>
          {!canSave && !busy && <span className="text-xs text-text-muted">Name, link and blurb are required.</span>}
        </div>
      </div>
    </div>,
    document.body
  );
}

interface CoverReport {
  total: number;
  resolved: { name: string }[];
  unresolved: { name: string; url: string }[];
}

function ResolveCoversButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<CoverReport | null>(null);
  const [error, setError] = useState("");

  async function run(force: boolean) {
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const res = await fetch("/api/admin/media-picks/resolve-covers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.error as string) || "Failed.");
      } else {
        setReport(data as CoverReport);
        router.refresh();
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(false)}
          title="Resolve covers for books with no image yet, and save them"
          className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImageDown className="h-3.5 w-3.5" />
          )}
          Resolve book covers
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(true)}
          title="Re-resolve EVERY book cover (refresh existing)"
          className="rounded-md border border-border-default px-2.5 py-2 text-xs font-semibold text-text-muted hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40"
        >
          Refresh all
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {report && (
        <div className="max-w-sm rounded-md border border-border-subtle bg-surface-1 p-3 text-xs">
          <p className="font-semibold text-text-primary">
            {report.resolved.length} resolved · {report.unresolved.length} unresolved
            <span className="font-normal text-text-muted"> (of {report.total})</span>
          </p>
          {report.unresolved.length > 0 && (
            <div className="mt-2">
              <p className="text-text-muted">
                Hand-set an Image URL for these (placeholder shown until you do):
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-text-secondary">
                {report.unresolved.map((u) => (
                  <li key={u.name}>{u.name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Kpi {
  perKind: Record<string, { published: number; unpublished: number }>;
  top: { id: string; name: string; kind: string; clicks: number }[];
  windowDays: number;
}

const KIND_SHORT: Record<AdminMediaPick["kind"], string> = {
  youtube: "Watch",
  video: "Episodes",
  book: "Read",
  podcast: "Listen",
};

/** KPI strip (Phase 6.8 D2): per-kind counts + top items by clicks. */
function KpiHeader({ kpi }: { kpi: Kpi }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-lg border border-border-subtle bg-surface-0 p-4 lg:col-span-2">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
          Catalogue
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {KINDS.map((k) => {
            const c = kpi.perKind[k] ?? { published: 0, unpublished: 0 };
            return (
              <div key={k}>
                <p className="text-2xl font-bold tabular-nums text-text-primary">
                  {c.published}
                  {c.unpublished > 0 && (
                    <span className="ml-1 text-sm font-normal text-text-muted">
                      +{c.unpublished} draft
                    </span>
                  )}
                </p>
                <p className="text-xs text-text-muted">{KIND_SHORT[k]}</p>
              </div>
            );
          })}
        </div>
      </div>
      <div className="rounded-lg border border-border-subtle bg-surface-0 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
          Top by clicks · {kpi.windowDays}d
        </p>
        {kpi.top.length === 0 ? (
          <p className="text-sm text-text-muted">No outbound clicks yet.</p>
        ) : (
          <ol className="space-y-1">
            {kpi.top.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-text-secondary">
                  <span className="text-text-muted">{KIND_SHORT[t.kind as AdminMediaPick["kind"]]}</span>{" "}
                  {t.name}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-brand-gold">{t.clicks}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export function MediaPicksAdmin({ rows, kpi }: { rows: AdminMediaPick[]; kpi: Kpi }) {
  const router = useRouter();
  // Part B — three tabbed sections (Watch / Read / Listen), one at a time, so you
  // can never scroll past from one kind into another by accident.
  const [section, setSection] = useState<Section>("watch");
  const [q, setQ] = useState("");
  const [pubFilter, setPubFilter] = useState<"all" | "published" | "draft">("all");
  const [healthFilter, setHealthFilter] = useState<"all" | "ok" | "broken" | "unchecked">("all");
  const [reviewing, setReviewing] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  // Part B (B4) — the shared add/edit modal (null = closed).
  const [modal, setModal] = useState<ModalState | null>(null);
  const query = q.trim().toLowerCase();

  const shownKinds = SECTION_KINDS[section];
  const match = (r: AdminMediaPick) => {
    if (query && !`${r.name} ${r.creator ?? ""} ${r.url}`.toLowerCase().includes(query)) return false;
    if (pubFilter === "published" && !r.is_published) return false;
    if (pubFilter === "draft" && r.is_published) return false;
    if (healthFilter === "ok" && r.link_status !== "ok") return false;
    if (healthFilter === "broken" && r.link_status !== "broken") return false;
    if (healthFilter === "unchecked" && (r.link_status ?? "unchecked") !== "unchecked") return false;
    return true;
  };
  const brokenCount = rows.filter((r) => r.link_status === "broken").length;
  const sectionCount = (sec: Section) => rows.filter((r) => SECTION_KINDS[sec].includes(r.kind)).length;
  const sectionBroken = (sec: Section) =>
    rows.filter((r) => SECTION_KINDS[sec].includes(r.kind) && r.link_status === "broken").length;

  async function reviewLibrary() {
    setReviewing(true);
    setBanner(null);
    try {
      const data = await checkLinks();
      const s = data?.summary;
      if (s) {
        setBanner(
          `Checked ${s.total} · ✅ ${s.ok} OK · ⚠️ ${s.redirected} redirected · ❌ ${s.broken} broken · ${s.unchecked} unchecked`
        );
      }
      router.refresh();
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="space-y-8">
      <KpiHeader kpi={kpi} />

      {/* Part C — library link-health toolbar + summary banner. */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={reviewLibrary}
          disabled={reviewing}
          className="inline-flex items-center gap-2 rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-50"
        >
          {reviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Review library links
        </button>
        {brokenCount > 0 && (
          <span className="inline-flex items-center rounded-full border border-destructive/50 bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive">
            {brokenCount} broken
          </span>
        )}
        {banner && <span className="text-xs text-text-muted">{banner}</span>}
      </div>

      {/* Section tabs (Watch / Read / Listen) + search + filters. */}
      <div className="sticky top-0 z-10 -mx-2 flex flex-wrap items-center gap-2 bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border-subtle bg-surface-0 p-1">
          {(["watch", "read", "listen"] as Section[]).map((sec) => {
            const on = section === sec;
            const broke = sectionBroken(sec);
            return (
              <button
                key={sec}
                type="button"
                onClick={() => setSection(sec)}
                className={
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors " +
                  (on ? "bg-brand-gold text-text-inverse" : "text-text-secondary hover:text-text-primary")
                }
              >
                {SECTION_LABEL[sec]}
                <span className={on ? "ml-1 text-text-inverse/70" : "ml-1 text-text-muted"}>{sectionCount(sec)}</span>
                {broke > 0 && <span className="ml-1 text-destructive">· {broke}✕</span>}
              </button>
            );
          })}
        </div>
        <select
          value={pubFilter}
          onChange={(e) => setPubFilter(e.target.value as typeof pubFilter)}
          className="rounded-md border border-border-default bg-surface-1 px-2 py-1.5 text-xs text-text-primary focus:outline-none"
        >
          <option value="all">All states</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <select
          value={healthFilter}
          onChange={(e) => setHealthFilter(e.target.value as typeof healthFilter)}
          className="rounded-md border border-border-default bg-surface-1 px-2 py-1.5 text-xs text-text-primary focus:outline-none"
        >
          <option value="all">Any link health</option>
          <option value="ok">OK</option>
          <option value="broken">Broken</option>
          <option value="unchecked">Unchecked</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, creator, URL…"
          className="ml-auto w-full max-w-xs rounded-md border border-border-default bg-surface-1 px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none"
        />
      </div>

      <div className="space-y-10">
        {shownKinds.map((kind) => {
          const items = rows
            .filter((r) => r.kind === kind && match(r))
            .sort((a, b) => a.sort_order - b.sort_order);
          return (
            <section key={kind} id={`wrl-${kind}`}>
              <div className="mb-3 flex items-center justify-between border-b border-border-subtle pb-2">
                <h2 className="text-lg font-bold text-text-primary">
                  {KIND_LABEL[kind]}{" "}
                  <span className="text-sm font-normal text-text-muted">({items.length})</span>
                </h2>
                <div className="flex flex-col items-end gap-2">
                  {kind === "book" && <ResolveCoversButton />}
                  <button
                    type="button"
                    onClick={() => setModal({ mode: "add", kind })}
                    className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border-default px-3 py-2 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add {KIND_ADD_LABEL[kind]}
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {items.length === 0 ? (
                  <p className="py-4 text-sm text-text-muted">
                    {query ? "No matches." : "Nothing here yet."}
                  </p>
                ) : (
                  items.map((pick) => <Row key={pick.id} pick={pick} onEdit={(p) => setModal({ mode: "edit", pick: p })} />)
                )}
              </div>
            </section>
          );
        })}
      </div>

      {modal && <MediaPickModal state={modal} allRows={rows} onClose={() => setModal(null)} />}
    </div>
  );
}
