"use client";

import { useState } from "react";
import {
  Check,
  X,
  Store,
  MessageSquare,
  ImageIcon,
  MapPin,
  Wrench,
  DoorClosed,
} from "lucide-react";
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

export type CorrectionItem = {
  id: string;
  kind: "correction" | "closure";
  message: string;
  created_at: string;
  contactEmail?: string;
  targetName?: string;
  targetSlug?: string;
};

type Tab = "submissions" | "corrections" | "reviews" | "photos";
type Bucket = "subs" | "corrections" | "reviews" | "photos";
type ApiType = "submission" | "review" | "photo";

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
  corrections: initialCorrections,
  reviews: initialReviews,
  photos: initialPhotos,
}: {
  submissions: Submission[];
  corrections: CorrectionItem[];
  reviews: ReviewItem[];
  photos: PhotoItem[];
}) {
  const [tab, setTab] = useState<Tab>("submissions");
  const [subs, setSubs] = useState(initialSubs);
  const [corrections, setCorrections] = useState(initialCorrections);
  const [reviews, setReviews] = useState(initialReviews);
  const [photos, setPhotos] = useState(initialPhotos);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(
    apiType: ApiType,
    id: string,
    action: "approve" | "reject",
    bucket: Bucket
  ) {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: apiType, id, action }),
      });
      if (res.ok) {
        if (bucket === "subs") setSubs((p) => p.filter((s) => s.id !== id));
        if (bucket === "corrections")
          setCorrections((p) => p.filter((c) => c.id !== id));
        if (bucket === "reviews") setReviews((p) => p.filter((r) => r.id !== id));
        if (bucket === "photos") setPhotos((p) => p.filter((ph) => ph.id !== id));
      }
    } finally {
      setBusy(null);
    }
  }

  const tabs: { key: Tab; label: string; icon: typeof Store; count: number }[] = [
    { key: "submissions", label: "Submissions", icon: Store, count: subs.length },
    { key: "corrections", label: "Corrections", icon: Wrench, count: corrections.length },
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
                    onApprove={() => act("submission", s.id, "approve", "subs")}
                    onReject={() => act("submission", s.id, "reject", "subs")}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}

      {/* Corrections & closures */}
      {tab === "corrections" &&
        (corrections.length === 0 ? (
          <EmptyState label="No pending corrections or closure reports." />
        ) : (
          <div className="space-y-4">
            {corrections.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-border-subtle bg-surface-0 p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.06em]",
                          c.kind === "closure"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-brand-gold/15 text-brand-gold"
                        )}
                      >
                        {c.kind === "closure" ? (
                          <DoorClosed className="h-3 w-3" />
                        ) : (
                          <Wrench className="h-3 w-3" />
                        )}
                        {c.kind === "closure" ? "Closure report" : "Correction"}
                      </span>
                      {c.targetSlug ? (
                        <Link
                          href={`/restaurants/${c.targetSlug}`}
                          className="font-heading font-bold text-text-primary hover:text-brand-gold"
                        >
                          {c.targetName ?? "Venue"}
                        </Link>
                      ) : (
                        <span className="font-heading font-bold text-text-primary">
                          {c.targetName ?? "Venue"}
                        </span>
                      )}
                      <span className="text-xs text-text-muted">
                        {fmtDate(c.created_at)}
                      </span>
                    </div>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
                      {c.message}
                    </p>
                    {c.contactEmail && (
                      <p className="mt-2 text-xs text-text-muted">
                        Reporter: {c.contactEmail}
                      </p>
                    )}
                    {c.kind === "closure" && (
                      <p className="mt-2 text-xs text-text-muted">
                        Approving marks this venue permanently closed.
                      </p>
                    )}
                  </div>
                  <Actions
                    busy={busy === c.id}
                    onApprove={() => act("submission", c.id, "approve", "corrections")}
                    onReject={() => act("submission", c.id, "reject", "corrections")}
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
                    onApprove={() => act("review", r.id, "approve", "reviews")}
                    onReject={() => act("review", r.id, "reject", "reviews")}
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
                    onApprove={() => act("photo", p.id, "approve", "photos")}
                    onReject={() => act("photo", p.id, "reject", "photos")}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
