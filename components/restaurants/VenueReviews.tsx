"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquareText } from "lucide-react";

interface Review {
  id: string;
  body: string;
  created_at: string;
  author: string;
  username: string | null;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

/**
 * #315 — written, moderated reviews (NO star rating; we never rank BBQ). Shows
 * approved reviews and, for signed-in members, a submit box. New/edited reviews
 * go to moderation. Rendered as a client island so approvals show without a
 * static-page rebuild.
 */
export function VenueReviews({ restaurantId, venueName }: { restaurantId: string; venueName: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  function load() {
    fetch(`/api/reviews?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((d) => setReviews((d.reviews as Review[]) ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }
  useEffect(load, [restaurantId]);

  async function submit() {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError("Please sign in to leave a review.");
      } else if (!res.ok) {
        setError((data.error as string) || "Couldn't submit your review.");
      } else {
        setBody("");
        setMsg("Thanks — your review is in for moderation and will appear once approved.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-12">
      <h2 className="mb-5 flex items-center gap-2 border-b border-border-subtle pb-3 font-heading text-xl font-bold text-text-primary">
        <MessageSquareText className="h-5 w-5 text-brand-gold" />
        Reviews
      </h2>

      {/* Submit box — written only, no stars. */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-surface-0 p-4">
        <label className="text-sm font-semibold text-text-primary">
          Been to {venueName}? Tell people about it.
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="What was the barbecue like? What should someone order? (No star ratings — we don't rank barbecue.)"
          className="mt-2 w-full resize-y rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={busy || body.trim().length < 20}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-gold px-4 py-2 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Post review
          </button>
          <span className="text-xs text-text-muted">{body.trim().length}/4000 · min 20</span>
          {msg && <span className="text-xs text-emerald-400">{msg}</span>}
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      </div>

      {/* Approved reviews */}
      {!loaded ? (
        <p className="text-sm text-text-muted">Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-text-muted">No reviews yet — be the first.</p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-xl border border-border-subtle bg-surface-0 p-4">
              <div className="mb-1 flex items-center gap-2 text-xs text-text-muted">
                <span className="font-semibold text-text-secondary">
                  {r.username ? (
                    <a href={`/u/${r.username}`} className="hover:text-brand-gold">
                      {r.author}
                    </a>
                  ) : (
                    r.author
                  )}
                </span>
                <span>·</span>
                <span>{fmt(r.created_at)}</span>
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-text-secondary">{r.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
