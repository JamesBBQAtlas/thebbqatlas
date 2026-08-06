"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Instagram,
  Mail,
  Facebook,
  Phone,
  Globe,
  Twitter,
  Loader2,
  CheckCircle2,
} from "lucide-react";

export interface OutreachRow {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
  status: string;
  needsAttention: boolean;
  attentionReason: string | null;
  unknowns: string[];
  channels: {
    instagram: string | null;
    email: string | null;
    facebook: string | null;
    phone: string | null;
    website: string | null;
    x: string | null;
  };
  outreachStatus: string;
  nextFollowupAt: string | null;
  lastContact: { at: string; channel: string; note: string | null } | null;
}

const STATUS_OPTS = [
  "to_contact",
  "contacted",
  "awaiting_reply",
  "info_received",
  "declined",
  "resolved",
];
const statusLabel = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const LOG_CHANNELS = ["instagram", "email", "facebook", "phone", "website", "other"] as const;

const fmtDate = (iso: string | null) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
};

function ChannelButton({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Instagram;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

function Card({ row }: { row: OutreachRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [followup, setFollowup] = useState("");
  const [logStatus, setLogStatus] = useState("contacted");
  const [emailDraft, setEmailDraft] = useState(row.channels.email ?? "");

  const c = row.channels;
  const missing: string[] = [];
  if (!c.email) missing.push("email");
  if (!c.instagram) missing.push("Instagram");
  if (!c.website) missing.push("website");

  async function call(method: "POST" | "PATCH", payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/outreach", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: row.id, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error — please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function logOutreach() {
    const channels = [...picked];
    if (channels.length === 0) {
      setError("Pick at least one channel.");
      return;
    }
    const ok = await call("POST", {
      channels,
      note: note || undefined,
      status: logStatus,
      followupAt: followup || undefined,
    });
    if (ok) {
      setOpen(false);
      setPicked(new Set());
      setNote("");
      setFollowup("");
    }
  }

  const toggle = (ch: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(ch) ? next.delete(ch) : next.add(ch);
      return next;
    });

  return (
    <article className="rounded-xl border border-border-default bg-surface-0 p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-text-primary">
            {row.name}
            {row.city ? <span className="text-text-muted"> · {row.city}</span> : null}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {row.needsAttention && (
              <span className="rounded-full bg-brand-orange/15 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-brand-orange">
                Needs facts
              </span>
            )}
            {row.status === "parked" && (
              <span className="rounded-full bg-brand-gold/15 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-brand-gold">
                Parked
              </span>
            )}
            <span className="rounded-full border border-border-default px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-text-secondary">
              {statusLabel(row.outreachStatus)}
            </span>
          </div>
        </div>
        <div className="text-right text-xs text-text-muted">
          {row.lastContact ? (
            <p>
              Last: {statusLabel(row.lastContact.channel)} · {fmtDate(row.lastContact.at)}
            </p>
          ) : (
            <p>Not yet contacted</p>
          )}
          {row.nextFollowupAt ? (
            <p className="text-brand-gold">Follow up {fmtDate(row.nextFollowupAt)}</p>
          ) : null}
        </div>
      </div>

      {/* What we need */}
      {(row.unknowns.length > 0 || row.attentionReason) && (
        <div className="mt-4 rounded-lg border border-border-subtle bg-surface-1/50 p-3">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-text-muted">
            What we need
          </p>
          {row.unknowns.length > 0 ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {row.unknowns.map((u, i) => (
                <li
                  key={i}
                  className="rounded border border-border-default px-2 py-0.5 text-xs text-text-secondary"
                >
                  {u}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-text-secondary">{row.attentionReason}</p>
          )}
        </div>
      )}

      {/* Channels */}
      <div className="mt-4">
        <p className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-text-muted">
          Reach them
        </p>
        <div className="flex flex-wrap gap-2">
          {c.instagram && <ChannelButton href={c.instagram} icon={Instagram} label="Instagram" />}
          {c.email && <ChannelButton href={`mailto:${c.email}`} icon={Mail} label="Email" />}
          {c.facebook && <ChannelButton href={c.facebook} icon={Facebook} label="Facebook" />}
          {c.phone && <ChannelButton href={`tel:${c.phone}`} icon={Phone} label="Call" />}
          {c.website && <ChannelButton href={c.website} icon={Globe} label="Website" />}
          {c.x && <ChannelButton href={c.x} icon={Twitter} label="X" />}
        </div>
        {missing.length > 0 && (
          <p className="mt-1.5 text-xs text-text-muted">
            Missing: {missing.join(", ")} — worth hunting down.
          </p>
        )}
      </div>

      {/* Contact email inline edit (fills the most common gap) */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={emailDraft}
          onChange={(e) => setEmailDraft(e.target.value)}
          placeholder="Add a contact email…"
          className="w-56 rounded-md border border-border-default bg-surface-1 px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none"
        />
        <button
          type="button"
          disabled={busy || emailDraft === (row.channels.email ?? "")}
          onClick={() => call("PATCH", { contactEmail: emailDraft })}
          className="rounded-md border border-border-default px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40"
        >
          Save email
        </button>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-md bg-brand-gold px-4 py-2 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90"
        >
          Log outreach
        </button>
        <label className="text-xs text-text-muted">
          Status:{" "}
          <select
            value={row.outreachStatus === "none" ? "" : row.outreachStatus}
            onChange={(e) => e.target.value && call("PATCH", { status: e.target.value })}
            disabled={busy}
            className="ml-1 rounded-md border border-border-default bg-surface-1 px-2 py-1 text-xs text-text-primary focus:border-brand-gold/60 focus:outline-none"
          >
            <option value="">— set —</option>
            {STATUS_OPTS.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        {row.slug && (
          <a
            href={`/admin/enrich?venue=${row.id}`}
            className="text-xs font-semibold text-text-secondary underline-offset-2 hover:text-brand-gold hover:underline"
          >
            Edit / re-enrich →
          </a>
        )}
        {busy && <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />}
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {/* Log form */}
      {open && (
        <div className="mt-4 rounded-lg border border-border-default bg-surface-1/60 p-4">
          <p className="mb-2 text-xs font-semibold text-text-secondary">
            Which channels did you hit?
          </p>
          <div className="flex flex-wrap gap-2">
            {LOG_CHANNELS.map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => toggle(ch)}
                className={
                  "rounded-md border px-2.5 py-1.5 text-xs font-semibold capitalize transition-colors " +
                  (picked.has(ch)
                    ? "border-brand-gold bg-brand-gold/15 text-brand-gold"
                    : "border-border-default text-text-secondary hover:border-brand-gold/50")
                }
              >
                {picked.has(ch) && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                {ch}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Note — what you asked for, what they said…"
            className="mt-3 w-full rounded-md border border-border-default bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="text-xs text-text-muted">
              Set status:{" "}
              <select
                value={logStatus}
                onChange={(e) => setLogStatus(e.target.value)}
                className="ml-1 rounded-md border border-border-default bg-surface-0 px-2 py-1 text-xs text-text-primary focus:border-brand-gold/60 focus:outline-none"
              >
                {STATUS_OPTS.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-text-muted">
              Follow up:{" "}
              <input
                type="date"
                value={followup}
                onChange={(e) => setFollowup(e.target.value)}
                className="ml-1 rounded-md border border-border-default bg-surface-0 px-2 py-1 text-xs text-text-primary focus:border-brand-gold/60 focus:outline-none"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={logOutreach}
              className="ml-auto rounded-md bg-brand-gold px-4 py-2 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40"
            >
              Save log
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function OutreachList({ rows }: { rows: OutreachRow[] }) {
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <Card key={row.id} row={row} />
      ))}
    </div>
  );
}
