"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, AlertTriangle, Lock, Store, Ticket } from "lucide-react";

interface Venue {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  website: string | null;
  instagram_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  shop_url: string | null;
  tickets_url: string | null;
  gift_card_url: string | null;
  order_url: string | null;
  hours: Record<string, string> | null;
}

const DAYS: [string, string][] = [
  ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"],
];
const SOCIALS: [keyof Venue, string][] = [
  ["website", "Website"], ["instagram_url", "Instagram"], ["x_url", "X / Twitter"],
  ["facebook_url", "Facebook"], ["tiktok_url", "TikTok"], ["youtube_url", "YouTube"],
];
// PREMIUM (Pro-tier) link fields — full page control (Aug 19 realignment).
const PREMIUM_LINKS: [keyof Venue, string][] = [
  ["shop_url", "Online shop / merch"],
  ["order_url", "Order online"],
  ["tickets_url", "Tickets & events"],
  ["gift_card_url", "Gift cards"],
];

/** The moderated accuracy editor for one owned venue (Build Prompt 2b). Submits a
 *  proposed edit to /api/owner/venues/edit — it lands in moderation, never live.
 *  Pro-tier owners (hasControl) additionally get the premium owner links; the server
 *  re-checks entitlement, so these inputs are a convenience, not the gate. */
export function OwnerVenueEditor({
  venue,
  hasPending,
  hasControl = false,
  bare = false,
}: {
  venue: Venue;
  hasPending: boolean;
  hasControl?: boolean;
  bare?: boolean;
}) {
  const router = useRouter();
  const [desc, setDesc] = useState(venue.description ?? "");
  const [phone, setPhone] = useState(venue.phone ?? "");
  const [links, setLinks] = useState<Record<string, string>>(
    Object.fromEntries(SOCIALS.map(([k]) => [k, (venue[k] as string | null) ?? ""]))
  );
  const [premiumLinks, setPremiumLinks] = useState<Record<string, string>>(
    Object.fromEntries(PREMIUM_LINKS.map(([k]) => [k, (venue[k] as string | null) ?? ""]))
  );
  const [hours, setHours] = useState<Record<string, string>>(
    Object.fromEntries(DAYS.map(([d]) => [d, venue.hours?.[d] ?? ""]))
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok?: string; err?: string } | null>(null);

  async function submit() {
    setBusy(true);
    setResult(null);
    // Build the patch of everything the owner set (the server drops no-ops + validates).
    // Premium links are only included when Featured — the server enforces this too.
    const patch: Record<string, unknown> = {
      description: desc,
      phone,
      ...links,
      ...(hasControl ? premiumLinks : {}),
      hours: Object.fromEntries(DAYS.map(([d]) => [d, hours[d] ?? ""])),
    };
    let res: Response;
    try {
      res = await fetch("/api/owner/venues/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: venue.id, patch }),
      });
    } catch {
      setBusy(false);
      setResult({ err: "Network error — try again." });
      return;
    }
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setResult({ err: data.error ?? "Couldn't submit — try again." });
      return;
    }
    if (data.pending?.length) {
      setResult({ ok: `Submitted for review: ${data.pending.join(", ")}. It'll go live once approved.` });
      router.refresh();
    } else {
      setResult({ ok: data.message ?? "No changes to submit." });
    }
  }

  return (
    <section className={bare ? "" : "rounded-xl border border-border-subtle bg-surface-0 p-5"}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-xl font-bold text-text-primary">{venue.name}</h2>
        {hasPending && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
            <AlertTriangle className="h-3 w-3" /> changes awaiting review
          </span>
        )}
      </div>

      <label className="block text-sm">
        <span className="text-text-secondary">Description</span>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary"
        />
      </label>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-text-secondary">Phone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary" />
        </label>
        {SOCIALS.map(([k, label]) => (
          <label key={String(k)} className="block text-sm">
            <span className="text-text-secondary">{label}</span>
            <input
              value={links[k as string] ?? ""}
              onChange={(e) => setLinks((s) => ({ ...s, [k as string]: e.target.value }))}
              placeholder="https://…"
              className="mt-1 w-full rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary"
            />
          </label>
        ))}
      </div>

      {/* PREMIUM links — the $49 Pro tier "page control" capability. */}
      <div className="mt-5 rounded-lg border border-brand-gold/25 bg-brand-gold/5 p-4">
        <div className="mb-2 flex items-center gap-1.5">
          <Store className="h-4 w-4 text-brand-gold" />
          <span className="text-sm font-semibold text-text-primary">Owner links</span>
          <span className="ml-1 rounded-full bg-brand-gold/15 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.06em] text-brand-gold">
            Pro
          </span>
        </div>
        {/* Tier 3 — "you keep 100%" reassurance, stated where the owner adds outbound
            commerce links. True in code (owner links never get an affiliate tag). */}
        <p className="mb-3 text-xs text-text-muted">
          Your links are yours — we never add our tag or take a cut of your sales. You keep 100%.
        </p>
        {hasControl ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PREMIUM_LINKS.map(([k, label]) => (
              <label key={String(k)} className="block text-sm">
                <span className="flex items-center gap-1 text-text-secondary">
                  {k === "tickets_url" ? <Ticket className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}
                  {label}
                </span>
                <input
                  value={premiumLinks[k as string] ?? ""}
                  onChange={(e) => setPremiumLinks((s) => ({ ...s, [k as string]: e.target.value }))}
                  placeholder="https://…"
                  className="mt-1 w-full rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-sm text-text-primary"
                />
              </label>
            ))}
          </div>
        ) : (
          <p className="flex items-start gap-1.5 text-sm text-text-muted">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Add your shop/merch, ordering, tickets &amp; events, and gift-card links with the{" "}
              <span className="font-semibold text-brand-gold">Pro tier</span>. Upgrade from your
              venue page.
            </span>
          </p>
        )}
      </div>

      <div className="mt-4">
        <span className="text-sm text-text-secondary">Opening hours</span>
        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DAYS.map(([d, label]) => (
            <label key={d} className="flex items-center gap-2 text-sm">
              <span className="w-10 shrink-0 text-text-muted">{label}</span>
              <input
                value={hours[d] ?? ""}
                onChange={(e) => setHours((s) => ({ ...s, [d]: e.target.value }))}
                placeholder="e.g. 11:00–21:00 or Closed"
                className="w-full rounded-lg border border-border-subtle bg-surface-1 px-2 py-1.5 text-sm text-text-primary"
              />
            </label>
          ))}
        </div>
      </div>

      {result?.ok && <p className="mt-3 flex items-center gap-1 text-sm text-emerald-400"><Check className="h-4 w-4" />{result.ok}</p>}
      {result?.err && <p className="mt-3 text-sm text-destructive">{result.err}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-brand-gold px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit for review
        </button>
        <p className="text-xs text-text-muted">Edits are reviewed before going live.</p>
      </div>
    </section>
  );
}
