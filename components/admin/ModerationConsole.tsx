"use client";

import { useState } from "react";
import { Check, X, Store, MessageSquare, ImageIcon, MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { STYLE_LABELS, type BbqStyle } from "@/lib/constants/styles";
import { restaurantSlug } from "@/lib/utils/slug";
import type { Submission } from "@/lib/types/database";
import { cn } from "@/lib/utils/cn";

export type ReviewItem = {
  id: string;
  body: string;
  rating: number;
  created_at: string;
  restaurantName?: string;
  restaurantSlug?: string;
  reviewer: string;
};

export type PhotoItem = {
  id: string;
  url: string;
  created_at: string;
  restaurantName?: string;
  restaurantSlug?: string;
};

type Tab = "submissions" | "reviews" | "photos";
type ModType = "submission" | "review" | "photo";

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/** Approve / Reject buttons shared across every queue item. */
function Actions({
  busy,
  onApprove,
  onReject,
}: {
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        onClick={onApprove}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-brand-gold px-3.5 py-2 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
      >
        <Check className="h-3.5 w-3.5" /> Approve
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-destructive hover:text-destructive disabled:opacity-40"
      >
        <X className="h-3.5 w-3.5" /> Reject
      </button>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-center text-text-muted">
      {label}
    </p>
  );
}

export function ModerationConsole({
  submissions: initialSubs,
  reviews: initialReviews,
  photos: initialPhotos,
}: {
  submissions: Submission[];
  reviews: ReviewItem[];
  photos: PhotoItem[];
}) {
  const [tab, setTab] = useState<Tab>("submissions");
  const [subs, setSubs] = useState(initialSubs);
  const [reviews, setReviews] = useState(initialReviews);
  const [photos, setPhotos] = useState(initialPhotos);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(type: ModType, id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, action }),
      });
      if (res.ok) {
        if (type === "submission") setSubs((p) => p.filter((s) => s.id !== id));
        if (type === "review") setReviews((p) => p.filter((r) => r.id !== id));
        if (type === "photo") setPhotos((p) => p.filter((ph) => ph.id !== id));
      }
    } finally {
      setBusy(null);
    }
  }

  const tabs: { key: Tab; label: string; icon: typeof Store; count: number }[] = [
    { key: "submissions", label: "Submissions", icon: Store, count: subs.length },
    { key: "reviews", label: "Reviews", icon: MessageSquare, count: reviews.length },
    { key: "photos", label: "Photos", icon: ImageIcon, count: photos.length },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-border-subtle">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "relative -mb-px flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors",
              tab === key
                ? "text-brand-gold"
                : "text-text-muted hover:text-text-secondary"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-bold",
                count > 0
                  ? "bg-brand-orange/20 text-brand-orange"
                  : "bg-surface-2 text-text-muted"
              )}
            >
              {count}
            </span>
            {tab === key && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-gold" />
            )}
          </button>
        ))}
      </div>

      {/* Submissions */}
      {tab === "submissions" &&
        (subs.length === 0 ? (
          <EmptyState label="No pending submissions. Queue is clear." />
        ) : (
          <div className="space-y-4">
            {subs.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-border-subtle bg-surface-0 p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-heading text-lg font-bold text-text-primary">
                      {s.name}
                    </h3>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-text-muted">
                      <MapPin className="h-3.5 w-3.5" />
                      {[s.address, s.city, s.country].filter(Boolean).join(", ")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(s.styles?.length ? s.styles : [s.style]).map((st) => (
                        <span
                          key={st}
                          className="rounded-full border border-brand-sienna/60 bg-brand-sienna/10 px-2.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-brand-sienna"
                        >
                          {STYLE_LABELS[st as BbqStyle] ?? st}
                        </span>
                      ))}
                    </div>
                    {s.description && (
                      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
                        {s.description}
                      </p>
                    )}
                    {(s.contact_email || s.instagram_handle || s.website) && (
                      <p className="mt-2 truncate text-xs text-text-muted">
                        {[s.website, s.contact_email, s.instagram_handle]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-text-muted">
                      Slug preview:{" "}
                      <span className="text-text-secondary">
                        {restaurantSlug(s.name, s.city)}
                      </span>{" "}
                      · {fmtDate(s.created_at)}
                    </p>
                  </div>
                  <Actions
                    busy={busy === s.id}
                    onApprove={() => act("submission", s.id, "approve")}
                    onReject={() => act("submission", s.id, "reject")}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}

      {/* Reviews */}
      {tab === "reviews" &&
        (reviews.length === 0 ? (
          <EmptyState label="No pending reviews. Nothing to moderate." />
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-border-subtle bg-surface-0 p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {r.restaurantSlug ? (
                        <Link
                          href={`/restaurants/${r.restaurantSlug}`}
                          className="font-heading font-bold text-text-primary hover:text-brand-gold"
                        >
                          {r.restaurantName ?? "Restaurant"}
                        </Link>
                      ) : (
                        <span className="font-heading font-bold text-text-primary">
                          {r.restaurantName ?? "Restaurant"}
                        </span>
                      )}
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-brand-gold">
                        {r.rating}/5
                      </span>
                      <span className="text-xs text-text-muted">
                        by {r.reviewer} · {fmtDate(r.created_at)}
                      </span>
                    </div>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
                      {r.body}
                    </p>
                  </div>
                  <Actions
                    busy={busy === r.id}
                    onApprove={() => act("review", r.id, "approve")}
                    onReject={() => act("review", r.id, "reject")}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}

      {/* Photos */}
      {tab === "photos" &&
        (photos.length === 0 ? (
          <EmptyState label="No pending photos. (User uploads arrive in the content phase.)" />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {photos.map((p) => (
              <div
                key={p.id}
                className="overflow-hidden rounded-xl border border-border-subtle bg-surface-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.restaurantName ?? "User photo"}
                  className="h-48 w-full object-cover"
                />
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {p.restaurantName ?? "Restaurant"}
                    </p>
                    <p className="text-xs text-text-muted">{fmtDate(p.created_at)}</p>
                  </div>
                  <Actions
                    busy={busy === p.id}
                    onApprove={() => act("photo", p.id, "approve")}
                    onReject={() => act("photo", p.id, "reject")}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
