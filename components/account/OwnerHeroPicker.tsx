"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, ImageIcon, AlertTriangle } from "lucide-react";

interface Candidate {
  id: string;
  url: string;
  caption: string | null;
}

/**
 * Owner hero-photo picker (Pro tier). Lists the owner's OWN already-approved photos for a
 * venue and lets them propose one as the hero. It routes through moderation (kind='hero_set')
 * — never live. Rendered only when the venue has Pro control; the server re-checks anyway.
 */
export function OwnerHeroPicker({ venueId, hasPending }: { venueId: string; hasPending: boolean }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok?: string; err?: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/owner/venues/hero?restaurantId=${venueId}`)
      .then((r) => r.json())
      .then((d) => {
        if (live) setCandidates((d.candidates as Candidate[]) ?? []);
      })
      .catch(() => {
        if (live) setCandidates([]);
      });
    return () => {
      live = false;
    };
  }, [venueId]);

  async function submit() {
    if (!chosen) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/owner/venues/hero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: venueId, mediaId: chosen }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ ok: "Hero photo submitted for review — it'll go live once approved." });
        router.refresh();
      } else {
        setResult({ err: data.error ?? "Couldn't submit — try again." });
      }
    } catch {
      setResult({ err: "Network error — try again." });
    }
    setBusy(false);
  }

  return (
    <div className="mt-5 rounded-lg border border-brand-gold/25 bg-brand-gold/5 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <ImageIcon className="h-4 w-4 text-brand-gold" />
        <span className="text-sm font-semibold text-text-primary">Hero photo</span>
        <span className="ml-1 rounded-full bg-brand-gold/15 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.06em] text-brand-gold">
          Pro
        </span>
        {hasPending && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-400">
            <AlertTriangle className="h-3 w-3" /> awaiting review
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-text-muted">
        Choose your hero from the photos you&apos;ve uploaded that we&apos;ve already approved. Your
        pick is reviewed before it goes live.
      </p>

      {candidates === null ? (
        <p className="flex items-center gap-2 text-sm text-text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading your photos…</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-text-muted">
          No approved photos yet. Upload photos on your venue page — once they&apos;re approved they
          appear here to choose from.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChosen(c.id)}
                className={`relative aspect-video overflow-hidden rounded-lg border-2 transition-colors ${
                  chosen === c.id ? "border-brand-gold" : "border-transparent hover:border-brand-gold/50"
                }`}
                aria-pressed={chosen === c.id}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.url} alt={c.caption ?? ""} className="h-full w-full object-cover" />
                {chosen === c.id && (
                  <span className="absolute right-1 top-1 rounded-full bg-brand-gold p-0.5 text-text-inverse">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !chosen}
              className="inline-flex items-center gap-1 rounded-md bg-brand-gold px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Set as hero (review)
            </button>
          </div>
        </>
      )}

      {result?.ok && <p className="mt-3 flex items-center gap-1 text-sm text-emerald-400"><Check className="h-4 w-4" />{result.ok}</p>}
      {result?.err && <p className="mt-3 text-sm text-destructive">{result.err}</p>}
    </div>
  );
}
