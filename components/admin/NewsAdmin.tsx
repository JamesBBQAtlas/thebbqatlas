"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Plus, ExternalLink, Eye } from "lucide-react";

export interface AdminNewsPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_md: string | null;
  hero_image_url: string | null;
  category: "news" | "missive";
  author: string | null;
  is_published: boolean;
  published_at: string | null;
  featured_video_id: string | null;
  created_at: string;
}

const inputCls =
  "w-full rounded-md border border-border-default bg-surface-1 px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none";

async function api(method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>) {
  const res = await fetch("/api/admin/news", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: data.error as string | undefined, data };
}

function Row({ post }: { post: AdminNewsPost }) {
  const router = useRouter();
  const [draft, setDraft] = useState(post);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(!post.is_published); // drafts expanded by default

  const dirty =
    draft.title !== post.title ||
    draft.slug !== post.slug ||
    draft.excerpt !== post.excerpt ||
    draft.content_md !== post.content_md ||
    draft.hero_image_url !== post.hero_image_url ||
    draft.author !== post.author ||
    draft.category !== post.category ||
    draft.featured_video_id !== post.featured_video_id;

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
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            "rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.05em] " +
            (post.is_published
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-amber-500/15 text-amber-400")
          }
        >
          {post.is_published ? "Published" : "Draft"}
        </span>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.05em] text-text-muted">
          {post.category}
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold text-text-primary">{post.title}</span>
        <a
          href={`/news/${post.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          title={post.is_published ? "View live" : "Preview (draft renders only when published)"}
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-brand-gold"
        >
          <Eye className="h-3.5 w-3.5" /> /news/{post.slug}
        </a>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-md border border-border-default px-2 py-1 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
        >
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
            <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" />
            <input className={inputCls} value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="Slug" />
          </div>
          <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
            <select className={inputCls} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as "news" | "missive" })}>
              <option value="missive">Missive</option>
              <option value="news">News</option>
            </select>
            <input className={inputCls} value={draft.author ?? ""} onChange={(e) => setDraft({ ...draft, author: e.target.value })} placeholder="Author (optional)" />
          </div>
          <textarea className={inputCls + " resize-none"} rows={2} value={draft.excerpt ?? ""} onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })} placeholder="Excerpt (one or two lines)" />
          <textarea className={inputCls + " resize-y font-mono text-xs"} rows={10} value={draft.content_md ?? ""} onChange={(e) => setDraft({ ...draft, content_md: e.target.value })} placeholder="Body (Markdown)" />
          <input className={inputCls} value={draft.hero_image_url ?? ""} onChange={(e) => setDraft({ ...draft, hero_image_url: e.target.value })} placeholder="Hero image URL (optional)" />
          <input className={inputCls} value={draft.featured_video_id ?? ""} onChange={(e) => setDraft({ ...draft, featured_video_id: e.target.value })} placeholder="Featured video — YouTube URL or id (optional)" />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={busy || !dirty}
              onClick={() =>
                run("PATCH", {
                  id: post.id,
                  title: draft.title,
                  slug: draft.slug,
                  excerpt: draft.excerpt,
                  content_md: draft.content_md,
                  hero_image_url: draft.hero_image_url,
                  author: draft.author,
                  category: draft.category,
                  featured_video_id: draft.featured_video_id,
                })
              }
              className="rounded-md bg-brand-gold px-3 py-1.5 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run("PATCH", { id: post.id, is_published: !post.is_published })}
              className={
                "rounded-md border px-3 py-1.5 text-xs font-semibold " +
                (post.is_published
                  ? "border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                  : "border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10")
              }
            >
              {post.is_published ? "Unpublish" : "Publish"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm(`Delete "${post.title}"? This cannot be undone.`)) run("DELETE", { id: post.id });
              }}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-border-default px-2.5 py-1.5 text-xs font-semibold text-text-muted hover:border-destructive/60 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            {busy && <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

function AddForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", excerpt: "", content_md: "", category: "missive", author: "The BBQ Atlas" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    const { ok, error } = await api("POST", { ...draft, is_published: false });
    setBusy(false);
    if (!ok) return setError(error || "Failed.");
    setDraft({ title: "", excerpt: "", content_md: "", category: "missive", author: "The BBQ Atlas" });
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border-default px-3 py-2 text-sm font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
      >
        <Plus className="h-4 w-4" /> New post (draft)
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-brand-gold/40 bg-surface-0 p-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
        <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" />
        <select className={inputCls} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
          <option value="missive">Missive</option>
          <option value="news">News</option>
        </select>
      </div>
      <textarea className={inputCls + " mt-2 resize-none"} rows={2} value={draft.excerpt} onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })} placeholder="Excerpt" />
      <textarea className={inputCls + " mt-2 resize-y font-mono text-xs"} rows={6} value={draft.content_md} onChange={(e) => setDraft({ ...draft, content_md: e.target.value })} placeholder="Body (Markdown)" />
      <div className="mt-3 flex items-center gap-2">
        <button type="button" disabled={busy || !draft.title.trim()} onClick={create} className="rounded-md bg-brand-gold px-3 py-1.5 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40">
          Create draft
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-muted">
          Cancel
        </button>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />}
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function NewsAdmin({ rows }: { rows: AdminNewsPost[] }) {
  const drafts = rows.filter((r) => !r.is_published);
  const published = rows.filter((r) => r.is_published);
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <a href="/news" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-brand-gold">
          <ExternalLink className="h-3.5 w-3.5" /> View public News page
        </a>
        <AddForm />
      </div>

      {drafts.length > 0 && (
        <section>
          <h2 className="mb-3 border-b border-border-subtle pb-2 text-lg font-bold text-text-primary">
            Drafts <span className="text-sm font-normal text-text-muted">({drafts.length})</span>
          </h2>
          <div className="space-y-3">
            {drafts.map((p) => <Row key={p.id} post={p} />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 border-b border-border-subtle pb-2 text-lg font-bold text-text-primary">
          Published <span className="text-sm font-normal text-text-muted">({published.length})</span>
        </h2>
        <div className="space-y-3">
          {published.length === 0 ? (
            <p className="py-4 text-sm text-text-muted">No published posts yet.</p>
          ) : (
            published.map((p) => <Row key={p.id} post={p} />)
          )}
        </div>
      </section>
    </div>
  );
}
