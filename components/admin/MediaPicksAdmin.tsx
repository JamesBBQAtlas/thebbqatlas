"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Plus } from "lucide-react";

export interface AdminMediaPick {
  id: string;
  kind: "youtube" | "book" | "podcast";
  name: string;
  creator: string | null;
  url: string;
  blurb: string;
  image_url: string | null;
  gear_link: string | null;
  sort_order: number;
  is_published: boolean;
}

const KIND_LABEL: Record<AdminMediaPick["kind"], string> = {
  youtube: "Watch — YouTube",
  book: "Read — Books",
  podcast: "Listen — Podcasts",
};
const KINDS: AdminMediaPick["kind"][] = ["youtube", "book", "podcast"];

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

function Row({ pick }: { pick: AdminMediaPick }) {
  const router = useRouter();
  const [draft, setDraft] = useState(pick);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty =
    draft.name !== pick.name ||
    draft.creator !== pick.creator ||
    draft.url !== pick.url ||
    draft.blurb !== pick.blurb ||
    draft.sort_order !== pick.sort_order ||
    draft.gear_link !== pick.gear_link;

  async function run(method: "PATCH" | "DELETE", payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const { ok, error } = await api(method, payload);
    setBusy(false);
    if (!ok) return setError(error || "Failed.");
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border-default bg-surface-0 p-4">
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
        value={draft.gear_link ?? ""}
        onChange={(e) => setDraft({ ...draft, gear_link: e.target.value })}
        placeholder="Gear link (optional → /gear)"
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
              gear_link: draft.gear_link,
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

export function MediaPicksAdmin({ rows }: { rows: AdminMediaPick[] }) {
  return (
    <div className="space-y-10">
      {KINDS.map((kind) => {
        const items = rows.filter((r) => r.kind === kind);
        return (
          <section key={kind}>
            <div className="mb-3 flex items-center justify-between border-b border-border-subtle pb-2">
              <h2 className="text-lg font-bold text-text-primary">
                {KIND_LABEL[kind]}{" "}
                <span className="text-sm font-normal text-text-muted">({items.length})</span>
              </h2>
              <AddForm kind={kind} />
            </div>
            <div className="space-y-3">
              {items.map((pick) => (
                <Row key={pick.id} pick={pick} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
