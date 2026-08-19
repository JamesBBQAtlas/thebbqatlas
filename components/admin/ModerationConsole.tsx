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
  BadgeCheck,
  AlertTriangle,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { STYLE_LABELS, type BbqStyle } from "@/lib/constants/styles";
import { restaurantSlug } from "@/lib/utils/slug";
import type { Submission } from "@/lib/types/database";
import { cn } from "@/lib/utils/cn";
import { SubmissionEnrichTools } from "@/components/admin/SubmissionEnrichTools";

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
  /** Which table this pending photo lives in — a community venue upload sits in
   *  `media`, a review attachment in `review_photos`. Decides where approve/reject
   *  writes the status back (Part 3 — the tab used to read only review_photos, so the
   *  22 pending `media` venue photos never showed). Defaults to review for back-compat. */
  source?: "media" | "review";
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

export type ClaimModItem = {
  id: string;
  role: string;
  restaurantName?: string;
  restaurantSlug?: string;
  note?: string;
  contactEmail?: string;
  /** Verification hint (Prompt 2a): contact-email domain vs venue website domain. */
  domainMatch?: "match" | "mismatch" | "unknown";
  created_at: string;
};

type Tab = "submissions" | "corrections" | "claims" | "reviews" | "photos";
type Bucket = "subs" | "corrections" | "claims" | "reviews" | "photos";
type ApiType = "submission" | "review" | "photo" | "claim";

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
// Part E — reject reason codes for the audit trail. Approve stays one click; a
// reject asks for a reason before it fires, and the label is stored as the
// moderation note (admin_notes) so we can see WHY something was rejected.
const REJECT_REASONS: { code: string; label: string }[] = [
  { code: "spam", label: "Spam" },
  { code: "low_quality", label: "Low quality" },
  { code: "wrong_venue", label: "Wrong venue" },
  { code: "inappropriate", label: "Inappropriate" },
  { code: "duplicate", label: "Duplicate" },
  { code: "other", label: "Other" },
];

function Actions({
  busy,
  onApprove,
  onReject,
  approveLabel = "Approve",
}: {
  busy: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
  approveLabel?: string;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REJECT_REASONS[0].label);

  if (rejecting) {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Reason for rejecting"
          className="rounded-md border border-border-default bg-surface-0 px-2 py-2 text-xs text-text-primary focus:outline-none"
        >
          {REJECT_REASONS.map((r) => (
            <option key={r.code} value={r.label}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            onReject(reason);
            setRejecting(false);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-2 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-destructive/90 disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" /> Confirm
        </button>
        <button
          type="button"
          onClick={() => setRejecting(false)}
          className="rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-muted hover:text-text-secondary"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        onClick={onApprove}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-brand-gold px-3.5 py-2 text-xs font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
      >
        <Check className="h-3.5 w-3.5" /> {approveLabel}
      </button>
      <button
        type="button"
        onClick={() => setRejecting(true)}
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
  claims: initialClaims,
  reviews: initialReviews,
  photos: initialPhotos,
  dupTargets = {},
  subMeta = {},
  spamBlocked7d = 0,
}: {
  submissions: Submission[];
  corrections: CorrectionItem[];
  claims: ClaimModItem[];
  reviews: ReviewItem[];
  photos: PhotoItem[];
  /** submissionId → the venue it may duplicate (for the flag link). */
  dupTargets?: Record<string, { name: string; slug: string }>;
  /** submissionId → submitter provenance (IP / country) from the guarded form. */
  subMeta?: Record<string, { country: string | null; ip: string | null }>;
  /** Automated submissions blocked in the last 7 days (anti-spam intel). */
  spamBlocked7d?: number;
}) {
  const [tab, setTab] = useState<Tab>("submissions");
  const [subs, setSubs] = useState(initialSubs);
  const [corrections, setCorrections] = useState(initialCorrections);
  const [claims, setClaims] = useState(initialClaims);
  const [reviews, setReviews] = useState(initialReviews);
  const [photos, setPhotos] = useState(initialPhotos);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(
    apiType: ApiType,
    id: string,
    action: "approve" | "reject" | "merge",
    bucket: Bucket,
    notes?: string,
    // Part 3 — a photo can live in `media` (venue upload) or `review_photos`; pass the
    // source so the moderate route writes the status back to the right table.
    photoSource?: "media" | "review"
  ) {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: apiType, id, action, notes, source: photoSource }),
      });
      if (res.ok) {
        if (bucket === "subs") setSubs((p) => p.filter((s) => s.id !== id));
        if (bucket === "corrections")
          setCorrections((p) => p.filter((c) => c.id !== id));
        if (bucket === "claims") setClaims((p) => p.filter((c) => c.id !== id));
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
    { key: "claims", label: "Claims", icon: BadgeCheck, count: claims.length },
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
      {tab === "submissions" && (
        <>
          {spamBlocked7d > 0 && (
            <p className="mb-4 flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-xs text-text-muted">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              {spamBlocked7d} automated submission{spamBlocked7d === 1 ? "" : "s"} blocked in the last 7 days — logged (IP · country) for future Cloudflare rules.
            </p>
          )}
          {subs.length === 0 ? (
            <EmptyState label="No pending submissions. Queue is clear." />
          ) : (
            <div className="space-y-4">
            {subs.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-border-subtle bg-surface-0 p-6"
              >
                <div>
                  <div className="min-w-0">
                    <h3 className="font-heading text-lg font-bold text-text-primary">
                      {s.name}
                    </h3>
                    {/* Possible-duplicate flag (§ global dedupe guard). */}
                    {s.possible_duplicate_of && (
                      <p className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        Possible duplicate of{" "}
                        {dupTargets[s.id]?.slug ? (
                          <a
                            href={`/restaurants/${dupTargets[s.id].slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-brand-gold underline"
                          >
                            {dupTargets[s.id].name}
                          </a>
                        ) : (
                          <span className="font-semibold">an existing venue</span>
                        )}
                        {s.duplicate_reason ? ` — ${s.duplicate_reason}` : ""}
                      </p>
                    )}
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
                    {(subMeta[s.id]?.country || subMeta[s.id]?.ip) && (
                      <p className="mt-1 text-xs text-text-muted">
                        Submitted from:{" "}
                        <span className="text-text-secondary">{subMeta[s.id]?.country ?? "unknown"}</span>
                        {subMeta[s.id]?.ip ? <span className="text-text-muted"> · {subMeta[s.id]?.ip}</span> : null}
                      </p>
                    )}
                  </div>
                  <SubmissionEnrichTools
                    submissionId={s.id}
                    hasDuplicate={Boolean(s.possible_duplicate_of)}
                    onResolved={(id) => setSubs((p) => p.filter((x) => x.id !== id))}
                    onReject={(id) => act("submission", id, "reject", "subs")}
                    onMerge={(id) => act("submission", id, "merge", "subs", "Merged into the existing venue")}
                  />
                </div>
              </div>
            ))}
            </div>
          )}
        </>
      )}

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
                    onReject={(reason) => act("submission", c.id, "reject", "corrections", `Rejected — ${reason}`)}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}

      {/* Claims */}
      {tab === "claims" &&
        (claims.length === 0 ? (
          <EmptyState label="No pending ownership or seller claims." />
        ) : (
          <div className="space-y-4">
            {claims.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-border-subtle bg-surface-0 p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold/15 px-2.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.06em] text-brand-gold">
                        <BadgeCheck className="h-3 w-3" />
                        {c.role} claim
                      </span>
                      {c.restaurantSlug ? (
                        <Link
                          href={`/restaurants/${c.restaurantSlug}`}
                          className="font-heading font-bold text-text-primary hover:text-brand-gold"
                        >
                          {c.restaurantName ?? "Venue"}
                        </Link>
                      ) : (
                        <span className="font-heading font-bold text-text-primary">
                          {c.restaurantName ?? "Venue"}
                        </span>
                      )}
                      <span className="text-xs text-text-muted">
                        {fmtDate(c.created_at)}
                      </span>
                    </div>
                    {c.note && (
                      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
                        {c.note}
                      </p>
                    )}
                    {c.contactEmail && (
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        <span>Contact: {c.contactEmail}</span>
                        {c.domainMatch === "match" && (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-400">✓ email domain matches the venue website</span>
                        )}
                        {c.domainMatch === "mismatch" && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-400">email domain ≠ venue website — verify</span>
                        )}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-text-muted">
                      Approving grants this user ownership of the venue.
                    </p>
                  </div>
                  <Actions
                    busy={busy === c.id}
                    onApprove={() => act("claim", c.id, "approve", "claims")}
                    onReject={(reason) => act("claim", c.id, "reject", "claims", `Rejected — ${reason}`)}
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
                      {/* No numeric scores — we don't rank barbecue (Part E). */}
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-text-secondary">
                        Review
                      </span>
                      <span className="text-xs text-text-muted">
                        by {r.reviewer} · {fmtDate(r.created_at)} · from the venue page
                      </span>
                    </div>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
                      {r.body}
                    </p>
                  </div>
                  <Actions
                    busy={busy === r.id}
                    onApprove={() => act("review", r.id, "approve", "reviews")}
                    onReject={(reason) => act("review", r.id, "reject", "reviews", `Rejected — ${reason}`)}
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
                    {/* Part E — venue link (context one click away) + source + when. */}
                    {p.restaurantSlug ? (
                      <Link
                        href={`/restaurants/${p.restaurantSlug}`}
                        className="block truncate text-sm font-semibold text-text-primary hover:text-brand-gold"
                      >
                        {p.restaurantName ?? "Restaurant"}
                      </Link>
                    ) : (
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {p.restaurantName ?? "Restaurant"}
                      </p>
                    )}
                    <p className="text-xs text-text-muted">Community upload · {fmtDate(p.created_at)}</p>
                  </div>
                  <Actions
                    busy={busy === p.id}
                    onApprove={() => act("photo", p.id, "approve", "photos", undefined, p.source)}
                    onReject={(reason) => act("photo", p.id, "reject", "photos", `Rejected — ${reason}`, p.source)}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
