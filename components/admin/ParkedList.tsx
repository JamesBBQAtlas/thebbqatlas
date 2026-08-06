"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2, Check, Loader2, Archive } from "lucide-react";

export interface ParkedVenue {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  styleLabel: string;
  enrichedAt: string | null;
  excerpt: string | null;
}

/**
 * The Parked holding pen — non-venue pending accounts James shuffled out of the
 * queue (experiences, enthusiasts, a school he's courting). Nothing here is
 * public. Each can be returned to Pending in one click, or approved directly.
 * Status move only — no data is touched.
 */
export function ParkedList({ venues }: { venues: ParkedVenue[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  async function move(id: string, status: "pending" | "approved") {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/venues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDone((d) => ({ ...d, [id]: data.error ?? "Failed" }));
        return;
      }
      setDone((d) => ({ ...d, [id]: status === "pending" ? "Returned to Pending" : "Approved" }));
      router.refresh();
    } catch {
      setDone((d) => ({ ...d, [id]: "Network error" }));
    } finally {
      setBusy(null);
    }
  }

  if (!venues.length) {
    return (
      <p className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-text-muted">
        Nothing parked. Use the <Archive className="inline h-3.5 w-3.5 align-[-2px]" /> Park action in
        Pending to move a non-venue here — it stays out of the queue and off the public site until you
        bring it back.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {venues.map((v) => (
        <li
          key={v.id}
          className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border-subtle bg-surface-0 p-4"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-heading text-base font-bold text-text-primary">{v.name}</span>
              <span className="rounded-full border border-border-default px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-text-muted">
                {v.styleLabel}
              </span>
              {v.enrichedAt && (
                <span className="text-[0.6875rem] text-emerald-400/80">enriched</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-text-muted">
              {[v.city, v.country].filter(Boolean).join(", ") || "no location"}
            </p>
            {v.excerpt && <p className="mt-1.5 line-clamp-2 text-xs text-text-secondary">{v.excerpt}</p>}
            {done[v.id] && <p className="mt-1.5 text-xs text-emerald-400">{done[v.id]}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => move(v.id, "pending")}
              disabled={busy === v.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40"
            >
              {busy === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
              Return to Pending
            </button>
            <button
              type="button"
              onClick={() => move(v.id, "approved")}
              disabled={busy === v.id}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-gold px-3 py-1.5 text-xs font-bold uppercase text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
              Approve
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
