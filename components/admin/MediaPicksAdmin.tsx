"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Plus, ImageDown, Youtube } from "lucide-react";

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

function Row({ pick }: { pick: AdminMediaPick }) {
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
          onClick={() => {
            if (confirm(`Delete "${pick.name}"?`)) run("DELETE", { id: pick.id });
          }}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border-default px-2.5 py-1.5 text-xs font-semibold text-text-muted hover:border-destructive/60 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />}
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function AddForm({ kind }: { kind: AdminMediaPick["kind"] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", creator: "", url: "", blurb: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    const { ok, error } = await api("POST", {
      kind,
      name: draft.name,
      creator: draft.creator || undefined,
      url: draft.url,
      blurb: draft.blurb,
      is_published: true,
    });
    setBusy(false);
    if (!ok) return setError(error || "Failed.");
    setDraft({ name: "", creator: "", url: "", blurb: "" });
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border-default px-3 py-2 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
      >
        <Plus className="h-3.5 w-3.5" /> Add entry
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-brand-gold/40 bg-surface-0 p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className={inputCls}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Name"
        />
        <input
          className={inputCls}
          value={draft.creator}
          onChange={(e) => setDraft({ ...draft, creator: e.target.value })}
          placeholder="Creator (optional)"
        />
      </div>
      <input
        className={inputCls + " mt-2"}
        value={draft.url}
        onChange={(e) => setDraft({ ...draft, url: e.target.value })}
        placeholder="URL (Amazon product page for books)"
      />
      <textarea
        className={inputCls + " mt-2 resize-none"}
        rows={2}
        value={draft.blurb}
        onChange={(e) => setDraft({ ...draft, blurb: e.target.value })}
        placeholder="Blurb"
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={create}
          className="rounded-md bg-brand-gold px-3 py-1.5 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40"
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-muted"
        >
          Cancel
        </button>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />}
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface ResolvedVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  thumb: string | null;
  duration: string | null;
  row: {
    kind: string;
    name: string;
    creator: string;
    url: string;
    image_url: string | null;
    links: Record<string, string>;
  };
}

/**
 * "Episodes We Love" add form (Phase 6.5). Paste a YouTube video URL → the server
 * validates + resolves title/channel/thumbnail/duration via the YouTube Data API
 * → auto-fill → add a "why we love it" blurb → save. Fully self-serve, no code.
 */
function AddVideoForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [blurb, setBlurb] = useState("");
  const [resolved, setResolved] = useState<ResolvedVideo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setUrl("");
    setBlurb("");
    setResolved(null);
    setError("");
    setOpen(false);
  }

  async function resolve() {
    setBusy(true);
    setError("");
    setResolved(null);
    try {
      const res = await fetch("/api/admin/media-picks/resolve-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError((data.error as string) || "Couldn't resolve that video.");
      else setResolved(data as ResolvedVideo);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!resolved) return;
    setBusy(true);
    setError("");
    const { ok, error } = await api("POST", {
      ...resolved.row,
      blurb: blurb || `A ${resolved.channelTitle} video worth your time.`,
      links: JSON.stringify(resolved.row.links),
      is_published: true,
    });
    setBusy(false);
    if (!ok) return setError(error || "Failed.");
    reset();
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border-default px-3 py-2 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
      >
        <Plus className="h-3.5 w-3.5" /> Add a video
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-brand-gold/40 bg-surface-0 p-4">
      <div className="flex gap-2">
        <input
          className={inputCls}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube video URL"
        />
        <button
          type="button"
          disabled={busy || !url.trim()}
          onClick={resolve}
          className="shrink-0 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40"
        >
          {busy && !resolved ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Resolve"}
        </button>
      </div>

      {resolved && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-3">
            {resolved.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolved.thumb}
                alt=""
                className="h-16 w-28 shrink-0 rounded object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded bg-surface-1">
                <Youtube className="h-5 w-5 text-brand-gold/50" />
              </div>
            )}
            <div className="min-w-0 text-xs">
              <p className="font-semibold text-text-primary">{resolved.title}</p>
              <p className="text-text-muted">
                {resolved.channelTitle}
                {resolved.duration ? ` · ${resolved.duration}` : ""}
              </p>
            </div>
          </div>
          <textarea
            className={inputCls + " resize-none"}
            rows={2}
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder="Why we love it (optional — site voice)"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={create}
              className="rounded-md bg-brand-gold px-3 py-1.5 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40"
            >
              Add episode
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-muted"
            >
              Cancel
            </button>
            {busy && <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />}
          </div>
        </div>
      )}

      {!resolved && (
        <button
          type="button"
          onClick={reset}
          className="mt-2 text-xs font-semibold text-text-muted hover:text-text-secondary"
        >
          Cancel
        </button>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
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
                  {kind === "video" ? <AddVideoForm /> : <AddForm kind={kind} />}
                </div>
              </div>
              <div className="space-y-3">
                {items.length === 0 ? (
                  <p className="py-4 text-sm text-text-muted">
                    {query ? "No matches." : "Nothing here yet."}
                  </p>
                ) : (
                  items.map((pick) => <Row key={pick.id} pick={pick} />)
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
