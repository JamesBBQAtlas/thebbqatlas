"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  PenLine,
  Instagram,
  Check,
  Loader2,
  Pause,
  Play,
  Square,
  AlertTriangle,
  ImageIcon,
  Eye,
  X,
} from "lucide-react";
import { freshness } from "@/lib/admin/freshness";

export interface HubVenue {
  id: string;
  name: string;
  location_label: string | null;
  city: string | null;
  country: string | null;
  status: string;
  style: string;
  styleLabel: string;
  enriched_at: string | null;
  needs_attention: boolean;
  attention_reason: string | null;
  hasRealPhoto: boolean;
  heroUrl: string; // resolved (real or style default)
  heroSourceLabel: string;
  hasIG: boolean;
  postsCount: number;
  hasPendingCopy: boolean;
  hook: string | null;
  description: string | null;
  lat: number;
  lng: number;
}

type ActionKind = "enrich" | "rewrite" | "findig" | "publish";
type RunState = "idle" | "queued" | "running" | "done" | "attention" | "error";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ACTIONS: { kind: ActionKind; label: string; icon: typeof Sparkles }[] = [
  { kind: "enrich", label: "Enrich", icon: Sparkles },
  { kind: "rewrite", label: "Rewrite", icon: PenLine },
  { kind: "findig", label: "Find IG", icon: Instagram },
  { kind: "publish", label: "Publish", icon: Check },
];

async function callAction(id: string, kind: ActionKind): Promise<Response> {
  if (kind === "publish") {
    return fetch("/api/admin/venues", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: id, status: "approved" }),
    });
  }
  if (kind === "rewrite") {
    return fetch("/api/admin/venues/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: id }),
    });
  }
  return fetch("/api/admin/venues/enrich-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ restaurantId: id, mode: kind === "findig" ? "light" : "full" }),
  });
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: string }) {
  const color =
    tone === "amber" ? "text-amber-400" : tone === "gold" ? "text-brand-gold" : tone === "green" ? "text-emerald-400" : "text-text-primary";
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
      <div className={`font-heading text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs text-text-secondary">{label}</div>
    </div>
  );
}

export function VenueHub({
  venues,
  styleOptions,
  initialStatus = "all",
}: {
  venues: HubVenue[];
  styleOptions: { slug: string; label: string }[];
  initialStatus?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState(initialStatus);
  const [country, setCountry] = useState("all");
  const [photoF, setPhotoF] = useState("all"); // all | yes | no
  const [igF, setIgF] = useState("all");
  const [staleF, setStaleF] = useState(false);
  const [status, setStatus] = useState<Record<string, { state: RunState; msg?: string }>>({});
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ done: 0, attention: 0, total: 0, kind: "" as string });
  const [heroOpen, setHeroOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<HubVenue | null>(null);
  const pauseRef = useRef(false);
  const stopRef = useRef(false);

  const countries = useMemo(
    () => [...new Set(venues.map((v) => v.country).filter(Boolean) as string[])].sort(),
    [venues]
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return venues.filter((v) => {
      if (statusF !== "all" && v.status !== statusF) return false;
      if (country !== "all" && v.country !== country) return false;
      if (photoF === "yes" && !v.hasRealPhoto) return false;
      if (photoF === "no" && v.hasRealPhoto) return false;
      if (igF === "yes" && !v.hasIG) return false;
      if (igF === "no" && v.hasIG) return false;
      if (staleF && freshness(v.enriched_at).tone !== "red") return false;
      if (needle && !`${v.name} ${v.city ?? ""} ${v.country ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [venues, q, statusF, country, photoF, igF, staleF]);

  const metrics = useMemo(() => {
    const m = {
      total: venues.length,
      published: 0,
      drafts: 0,
      attention: 0,
      photo: 0,
      ig: 0,
      fresh30: 0,
      stale: 0,
    };
    for (const v of venues) {
      if (v.status === "approved") m.published++;
      if (v.status === "pending") m.drafts++;
      if (v.needs_attention) m.attention++;
      if (v.hasRealPhoto) m.photo++;
      if (v.hasIG) m.ig++;
      const tone = freshness(v.enriched_at).tone;
      if (tone === "green") m.fresh30++;
      if (tone === "red") m.stale++;
    }
    return m;
  }, [venues]);

  function toggle(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  const selectAllShown = () => setSelected(new Set(shown.map((v) => v.id)));
  const clearSel = () => setSelected(new Set());
  const setState = (id: string, state: RunState, msg?: string) =>
    setStatus((p) => ({ ...p, [id]: { state, msg } }));

  async function runOne(id: string, kind: ActionKind): Promise<RunState> {
    setState(id, "running");
    try {
      const res = await callAction(id, kind);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState(id, "error", data.error ?? "Failed");
        return "error";
      }
      if (data.needs_attention) {
        setState(id, "attention", data.attention_reason ?? "Needs attention");
        return "attention";
      }
      setState(id, "done");
      return "done";
    } catch {
      setState(id, "error", "Network error");
      return "error";
    }
  }

  async function runBatch(kind: ActionKind) {
    const ids = shown.filter((v) => selected.has(v.id)).map((v) => v.id);
    if (!ids.length || running) return;
    setRunning(true);
    setPaused(false);
    pauseRef.current = false;
    stopRef.current = false;
    let done = 0;
    let attention = 0;
    setProgress({ done: 0, attention: 0, total: ids.length, kind });
    for (const id of ids) setState(id, "queued");
    for (const id of ids) {
      if (stopRef.current) break;
      while (pauseRef.current && !stopRef.current) await sleep(300);
      if (stopRef.current) break;
      const r = await runOne(id, kind);
      if (r === "done") done++;
      else if (r === "attention") attention++;
      setProgress({ done, attention, total: ids.length, kind });
    }
    setRunning(false);
    setPaused(false);
    router.refresh();
  }

  async function single(id: string, kind: ActionKind) {
    await runOne(id, kind);
    router.refresh();
  }

  async function copyDecision(id: string, action: "approve" | "discard") {
    setState(id, "running");
    const res = await fetch("/api/admin/venues/approve-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: id, action }),
    });
    if (res.ok) router.refresh();
    else setState(id, "error", "Failed");
  }

  const selCount = shown.filter((v) => selected.has(v.id)).length;

  return (
    <div>
      {/* Metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Metric label="Total venues" value={metrics.total} />
        <Metric label="Published" value={metrics.published} tone="green" />
        <Metric label="Awaiting approval" value={metrics.drafts} tone="gold" />
        <Metric label="Needs attention" value={metrics.attention} tone="amber" />
        <Metric label="With real photo" value={metrics.photo} />
        <Metric label="With Instagram" value={metrics.ig} />
        <Metric label="Fresh (≤1mo)" value={metrics.fresh30} tone="green" />
        <Metric label="Stale" value={metrics.stale} tone="amber" />
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name / city / country…"
          className="w-60 rounded-md border border-border-default bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none"
        />
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded-md border border-border-default bg-surface-0 px-2 py-2 text-sm text-text-primary focus:outline-none">
          <option value="all">Any status</option>
          <option value="approved">Published</option>
          <option value="pending">Drafts</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-md border border-border-default bg-surface-0 px-2 py-2 text-sm text-text-primary focus:outline-none">
          <option value="all">Any country</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={photoF} onChange={(e) => setPhotoF(e.target.value)} className="rounded-md border border-border-default bg-surface-0 px-2 py-2 text-sm text-text-primary focus:outline-none">
          <option value="all">Any photo</option>
          <option value="yes">Real photo</option>
          <option value="no">Style default</option>
        </select>
        <select value={igF} onChange={(e) => setIgF(e.target.value)} className="rounded-md border border-border-default bg-surface-0 px-2 py-2 text-sm text-text-primary focus:outline-none">
          <option value="all">Any IG</option>
          <option value="yes">Has IG</option>
          <option value="no">No IG</option>
        </select>
        <button type="button" onClick={() => setStaleF((s) => !s)} className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${staleF ? "border-amber-500/60 bg-amber-500/10 text-amber-400" : "border-border-default text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"}`}>Stale only</button>
        <span className="text-xs text-text-muted">{shown.length} shown</span>
      </div>

      {/* Batch bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-border-subtle bg-surface-0 p-3">
        <button type="button" onClick={selectAllShown} className="rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold">Select all shown</button>
        {selected.size > 0 && <button type="button" onClick={clearSel} className="rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-muted hover:text-text-primary">Clear ({selected.size})</button>}
        <div className="mx-1 h-5 w-px bg-border-subtle" />
        {running ? (
          <>
            <span className="text-sm text-text-secondary">{progress.kind}: {progress.done + progress.attention} of {progress.total} · {progress.attention} need attention</span>
            <button type="button" onClick={() => { pauseRef.current = !pauseRef.current; setPaused(pauseRef.current); }} className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold">{paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}{paused ? "Resume" : "Pause"}</button>
            <button type="button" onClick={() => { stopRef.current = true; pauseRef.current = false; setPaused(false); }} className="inline-flex items-center gap-1.5 rounded-md border border-destructive/60 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"><Square className="h-3.5 w-3.5" />Stop</button>
          </>
        ) : (
          ACTIONS.map((a) => (
            <button key={a.kind} type="button" onClick={() => runBatch(a.kind)} disabled={selCount === 0} className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-2 text-xs font-bold uppercase tracking-[0.04em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40">
              <a.icon className="h-3.5 w-3.5" />{a.label} selected ({selCount})
            </button>
          ))
        )}
      </div>
      {running && <p className="mb-3 text-xs text-text-muted">One venue at a time. Pause/Stop halts after the current venue — never mid-record.</p>}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border-subtle">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-1 text-xs uppercase tracking-[0.05em] text-text-muted">
            <tr>
              <th className="px-3 py-3"></th>
              <th className="px-3 py-3 font-semibold">Venue</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">📷</th>
              <th className="px-3 py-3 font-semibold">IG</th>
              <th className="px-3 py-3 font-semibold">Enriched</th>
              <th className="px-3 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((v) => {
              const rt = status[v.id]?.state;
              const busy = rt === "running" || rt === "queued";
              const f = freshness(v.enriched_at);
              const needsEnrich = v.lat === 0 && v.lng === 0;
              return (
                <Fragment key={v.id}>
                  <tr className="border-t border-border-subtle bg-surface-0 align-top">
                    <td className="px-3 py-3"><input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} className="mt-1 h-4 w-4 accent-[#D4AF37]" aria-label={`Select ${v.name}`} /></td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-text-primary">
                        {v.name}
                        {v.location_label && <span className="ml-1.5 text-xs font-normal text-brand-sienna-light">· {v.location_label}</span>}
                      </div>
                      <div className="text-xs text-text-muted">{[v.city, v.country].filter(Boolean).join(", ")} · {v.styleLabel}</div>
                      {v.needs_attention && v.attention_reason && (
                        <div className="mt-1 inline-flex items-start gap-1 text-xs text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{v.attention_reason}</div>
                      )}
                      {v.hasPendingCopy && (
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span className="rounded-full border border-brand-gold/40 bg-brand-gold/10 px-2 py-0.5 font-semibold text-brand-gold">Pending copy</span>
                          <button type="button" onClick={() => copyDecision(v.id, "approve")} className="font-semibold text-emerald-400 hover:underline">Approve</button>
                          <button type="button" onClick={() => copyDecision(v.id, "discard")} className="text-text-muted hover:text-destructive">Discard</button>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {rt && rt !== "idle" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-gold">{busy && <Loader2 className="h-3 w-3 animate-spin" />}{rt === "running" ? "Working…" : rt === "queued" ? "Queued" : rt === "attention" ? "Attention" : rt === "error" ? (status[v.id]?.msg ?? "Error") : "Done"}</span>
                      ) : (
                        <span className="text-xs capitalize text-text-secondary">{v.status === "approved" ? "Published" : v.status}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">{v.hasRealPhoto ? <span className="text-emerald-400">yes</span> : <span className="text-text-muted">default</span>}</td>
                    <td className="px-3 py-3 text-xs">{v.hasIG ? <span className="text-emerald-400">✓ {v.postsCount || ""}</span> : <span className="text-text-muted">–</span>}</td>
                    <td className="px-3 py-3 text-xs text-text-muted">{f.label}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <IconBtn title="Re-research + rewrite" busy={busy} onClick={() => single(v.id, "enrich")}><Sparkles className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn title="Rewrite copy (Claude only)" busy={busy} onClick={() => single(v.id, "rewrite")}><PenLine className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn title={v.hasIG ? "IG ✓ — re-run Find IG" : "Find IG"} busy={busy} onClick={() => single(v.id, "findig")}>
                          <Instagram className={`h-3.5 w-3.5 ${v.hasIG ? "text-emerald-400" : ""}`} />
                        </IconBtn>
                        <IconBtn title="Hero image" onClick={() => setHeroOpen(heroOpen === v.id ? null : v.id)}><ImageIcon className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn title="Preview" onClick={() => setPreview(v)}><Eye className="h-3.5 w-3.5" /></IconBtn>
                        {v.status !== "approved" && (
                          <button type="button" onClick={() => single(v.id, "publish")} disabled={busy || needsEnrich} title={needsEnrich ? "Enrich first (no map location)" : "Publish"} className="inline-flex items-center gap-1 rounded-md bg-brand-gold px-2.5 py-1.5 text-xs font-bold uppercase text-text-inverse disabled:opacity-40">
                            <Check className="h-3.5 w-3.5" />Publish
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {heroOpen === v.id && (
                    <tr className="border-t border-border-subtle bg-surface-1/40">
                      <td colSpan={7} className="px-3 py-4">
                        <HeroPanel venue={v} styleOptions={styleOptions} onDone={() => { setHeroOpen(null); router.refresh(); }} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview && <PreviewModal venue={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function IconBtn({ children, title, onClick, busy }: { children: React.ReactNode; title: string; onClick: () => void; busy?: boolean }) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={busy} className="inline-flex items-center rounded-md border border-border-default px-2 py-1.5 text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40">
      {children}
    </button>
  );
}

function HeroPanel({ venue, styleOptions, onDone }: { venue: HubVenue; styleOptions: { slug: string; label: string }[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [style, setStyle] = useState(venue.style);
  const [photos, setPhotos] = useState<{ id: string; url: string }[] | null>(null);
  const [err, setErr] = useState("");

  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/venues/hero", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: venue.id, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) onDone();
    else setErr(data.error ?? "Failed");
  }

  async function loadPhotos() {
    const res = await fetch(`/api/admin/venues/media?id=${venue.id}`);
    const data = await res.json().catch(() => ({ photos: [] }));
    setPhotos(data.photos ?? []);
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <div className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={venue.heroUrl} alt="" className="h-28 w-48 rounded-lg border border-border-subtle object-cover" />
        <p className="mt-1.5 text-xs text-text-muted">{venue.heroSourceLabel}</p>
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={style} onChange={(e) => setStyle(e.target.value)} className="rounded-md border border-border-default bg-surface-0 px-2 py-1.5 text-sm text-text-primary focus:outline-none">
            {styleOptions.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={() => act({ action: "style", style })} className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40">Change style default</button>
          <button type="button" disabled={busy} onClick={() => act({ action: "clear" })} className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-muted hover:border-destructive hover:text-destructive disabled:opacity-40">Clear to default</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a licensed image URL…" className="w-64 rounded-md border border-border-default bg-surface-0 px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none" />
          <button type="button" disabled={busy || !url.trim()} onClick={() => act({ action: "licensed", url: url.trim() })} className="rounded-md bg-brand-gold px-3 py-1.5 text-xs font-bold text-text-inverse disabled:opacity-40">Set as hero</button>
          {photos === null ? (
            <button type="button" onClick={loadPhotos} className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold">Choose from user photos</button>
          ) : photos.length === 0 ? (
            <span className="text-xs text-text-muted">No approved user photos.</span>
          ) : null}
        </div>
        {photos && photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={p.url} alt="" onClick={() => act({ action: "user_photo", url: p.url })} className="h-16 w-16 cursor-pointer rounded-md border border-border-subtle object-cover transition hover:ring-2 hover:ring-brand-gold" />
            ))}
          </div>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
    </div>
  );
}

function PreviewModal({ venue, onClose }: { venue: HubVenue; onClose: () => void }) {
  const pc = venue.hasPendingCopy;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border-strong bg-surface-0 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative h-48 w-full overflow-hidden rounded-t-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={venue.heroUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-0 to-transparent" />
          <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"><X className="h-4 w-4" /></button>
          <span className="absolute bottom-3 left-4 rounded-full bg-black/50 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-white">{venue.heroSourceLabel}</span>
        </div>
        <div className="p-6">
          <h3 className="font-heading text-2xl font-bold text-text-primary">{venue.name}{venue.location_label && <span className="ml-2 text-base font-normal text-brand-sienna-light">· {venue.location_label}</span>}</h3>
          <p className="mt-1 text-sm text-text-muted">{[venue.city, venue.country].filter(Boolean).join(", ")} · {venue.styleLabel}</p>
          {pc && <p className="mt-3 rounded-md border border-brand-gold/40 bg-brand-gold/10 px-3 py-1.5 text-xs text-brand-gold">Showing pending (unapproved) copy.</p>}
          {venue.hook && <p className="mt-4 font-heading text-lg italic text-text-primary">{venue.hook}</p>}
          {venue.description ? (
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-text-secondary">
              {venue.description.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-muted">No copy yet — run Enrich or Rewrite.</p>
          )}
          <p className="mt-4 text-xs text-text-muted">{venue.hasIG ? `Instagram: ${venue.postsCount} post${venue.postsCount === 1 ? "" : "s"} on file` : "No Instagram on file"}</p>
        </div>
      </div>
    </div>
  );
}
