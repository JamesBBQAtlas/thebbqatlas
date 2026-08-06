"use client";

import { useState } from "react";
import { ExternalLink, Youtube, BookOpen, Podcast, Globe, Rss } from "lucide-react";
import type { MediaPick, MediaKind } from "@/lib/queries/media-picks";
import { MediaArt } from "./MediaArt";
import { AffiliateLink } from "@/components/monetization/AffiliateLink";

const TABS: { kind: MediaKind; label: string; Icon: typeof Youtube }[] = [
  { kind: "youtube", label: "Watch", Icon: Youtube },
  { kind: "book", label: "Read", Icon: BookOpen },
  { kind: "podcast", label: "Listen", Icon: Podcast },
];

const CTA: Record<MediaKind, string> = {
  youtube: "Watch on YouTube",
  book: "View on Amazon",
  podcast: "Listen",
};

// Podcast platform links, in the order we show them — each with its brand colour.
const PLATFORMS: { key: string; label: string; color: string }[] = [
  { key: "apple", label: "Apple", color: "#A3AAAE" }, // graphite
  { key: "spotify", label: "Spotify", color: "#1DB954" },
  { key: "youtube", label: "YouTube", color: "#FF0000" },
  { key: "deezer", label: "Deezer", color: "#A238FF" },
  { key: "official", label: "Official", color: "#9aa0a6" }, // neutral grey
  { key: "rss", label: "RSS", color: "#F26522" },
];

/** First sentence of the blurb, for the one-line teaser. */
function teaserOf(blurb: string): string {
  const m = blurb.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : blurb).trim();
}

const fmtSubs = (n: string | null | undefined): string | null => {
  if (!n) return null;
  const num = Number(n);
  if (!Number.isFinite(num)) return null;
  return `${num.toLocaleString("en-US")} subscribers`;
};

function OutboundPill({
  href,
  label,
  color,
  icon: Icon,
}: {
  href: string;
  label: string;
  color?: string;
  icon?: typeof Globe;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={color ? { borderColor: `${color}66`, color } : undefined}
      className={
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.6875rem] font-semibold transition-colors hover:bg-white/[0.06] " +
        (color ? "" : "border-border-default text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold")
      }
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {label}
    </a>
  );
}

function Card({ pick }: { pick: MediaPick }) {
  const [open, setOpen] = useState(false);
  const teaser = teaserOf(pick.blurb);
  const hasMore = teaser.length < pick.blurb.trim().length;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-black/60 transition-colors hover:border-brand-gold/40">
      <MediaArt src={pick.image_url} alt={pick.name} kind={pick.kind} />
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-base font-bold leading-snug text-text-primary">{pick.name}</h3>
        {pick.creator ? (
          <p className="mt-0.5 text-xs text-brand-gold/80">{pick.creator}</p>
        ) : null}
        {pick.kind === "youtube" && fmtSubs(pick.subscriberCount) ? (
          <p className="mt-0.5 text-[0.6875rem] text-white/45">{fmtSubs(pick.subscriberCount)}</p>
        ) : null}

        <p className="mt-2 flex-1 text-sm leading-relaxed text-white/60">
          {open ? pick.blurb : teaser}
          {hasMore ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="ml-1 whitespace-nowrap text-xs font-semibold text-brand-gold/80 hover:text-brand-gold"
            >
              {open ? "less" : "more"}
            </button>
          ) : null}
        </p>

        {pick.kind === "youtube" && pick.latest?.videoId ? (
          <a
            href={`https://www.youtube.com/watch?v=${pick.latest.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block truncate text-xs text-white/50 transition-colors hover:text-brand-gold"
            title={pick.latest.title}
          >
            ▶ Latest: {pick.latest.title}
          </a>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {pick.kind === "book" ? (
            <AffiliateLink href={pick.url} label={CTA.book} partner="amazon" product={pick.name} />
          ) : pick.kind === "podcast" ? (
            <PodcastLinks pick={pick} />
          ) : (
            <a
              href={pick.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-brand-gold transition-colors hover:text-brand-gold-light"
            >
              {CTA.youtube}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {pick.gear_link ? <OutboundPill href={pick.gear_link} label="Their kit" /> : null}
        </div>
      </div>
    </article>
  );
}

const PLATFORM_ICON: Record<string, typeof Globe> = {
  youtube: Youtube,
  official: Globe,
  rss: Rss,
};

function PodcastLinks({ pick }: { pick: MediaPick }) {
  const links = pick.links ?? {};
  const present = PLATFORMS.filter((p) => links[p.key]);
  // Fall back to the single stored url if no platform map is set.
  if (present.length === 0) {
    return <OutboundPill href={pick.url} label="Listen" />;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {present.map((p) => (
        <OutboundPill
          key={p.key}
          href={links[p.key]}
          label={p.label}
          color={p.color}
          icon={PLATFORM_ICON[p.key]}
        />
      ))}
    </div>
  );
}

export function MediaDirectory({
  picks,
}: {
  picks: { youtube: MediaPick[]; book: MediaPick[]; podcast: MediaPick[] };
}) {
  const [active, setActive] = useState<MediaKind>("youtube");
  const items = picks[active];

  return (
    <div>
      {/* Segmented control */}
      <div className="mb-8 inline-flex rounded-xl border border-white/10 bg-black/40 p-1">
        {TABS.map(({ kind, label, Icon }) => {
          const count = picks[kind].length;
          const on = active === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => setActive(kind)}
              className={
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors " +
                (on
                  ? "bg-brand-gold text-text-inverse"
                  : "text-text-secondary hover:text-text-primary")
              }
            >
              <Icon className="h-4 w-4" />
              {label}
              <span className={on ? "text-text-inverse/70" : "text-text-muted"}>· {count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((pick) => (
          <Card key={pick.id} pick={pick} />
        ))}
      </div>
    </div>
  );
}
