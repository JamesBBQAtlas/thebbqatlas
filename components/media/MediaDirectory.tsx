"use client";

import { useState, type ComponentType } from "react";
import { ExternalLink, Youtube, BookOpen, Podcast, Globe, Play } from "lucide-react";
import type { MediaPick, MediaKind } from "@/lib/queries/media-picks";
import { MediaArt } from "./MediaArt";
import { SubscribeButton } from "./SubscribeButton";
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
  video: "Watch on YouTube",
};

/* ------------------------------------------------------------------ *
 * Official podcast-platform brand marks (inline SVG, single-colour so
 * they inherit each platform's brand colour via currentColor). 24×24
 * viewBox, rendered at a consistent h-3 w-3 in the pills.
 * ------------------------------------------------------------------ */
type BrandIconProps = { className?: string };

function ApplePodcastsIcon({ className }: BrandIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <circle cx="12" cy="8.6" r="2.6" fill="currentColor" />
      <path
        fill="currentColor"
        d="M8.3 15c0-2 1.6-3.2 3.7-3.2s3.7 1.2 3.7 3.2c0 .9-.3 2.2-.8 3.5-.3.9-.6 1.7-1 2.4-.5.9-1.2 1.4-1.9 1.4s-1.4-.5-1.9-1.4c-.4-.7-.7-1.5-1-2.4-.5-1.3-.8-2.6-.8-3.5z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        d="M5.8 15.3a7.6 7.6 0 1 1 12.4 0"
      />
    </svg>
  );
}

function SpotifyIcon({ className }: BrandIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.56-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

function YouTubeMusicIcon({ className }: BrandIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm0 3a8 8 0 1 1 0 16 8 8 0 0 1 0-16z"
      />
      <path d="M10 8.2l6 3.8-6 3.8z" />
    </svg>
  );
}

function DeezerIcon({ className }: BrandIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <rect x="18.8" y="4.2" width="5.2" height="3" />
      <rect x="6.3" y="8.4" width="5.2" height="3" />
      <rect x="18.8" y="8.4" width="5.2" height="3" />
      <rect x="6.3" y="12.6" width="5.2" height="3" />
      <rect x="12.55" y="12.6" width="5.2" height="3" />
      <rect x="18.8" y="12.6" width="5.2" height="3" />
      <rect x="0" y="16.8" width="5.2" height="3" />
      <rect x="6.3" y="16.8" width="5.2" height="3" />
      <rect x="12.55" y="16.8" width="5.2" height="3" />
      <rect x="18.8" y="16.8" width="5.2" height="3" />
    </svg>
  );
}

// Podcast platform links, in the order we show them — each with its brand colour.
const PLATFORMS: { key: string; label: string; color: string }[] = [
  { key: "apple", label: "Apple Podcasts", color: "#B24BF3" }, // Apple Podcasts purple
  { key: "spotify", label: "Spotify", color: "#1DB954" },
  { key: "youtube", label: "YouTube Music", color: "#FF0000" },
  { key: "deezer", label: "Deezer", color: "#A238FF" },
  { key: "official", label: "Official", color: "#9aa0a6" }, // neutral grey
  { key: "rss", label: "RSS", color: "#9aa0a6" }, // neutral grey
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

/** ISO 8601 duration (PT#H#M#S) → "1:02:03" / "4:07". */
function fmtDuration(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  if (!h && !min && !s) return null;
  const two = (x: number) => String(x).padStart(2, "0");
  return h ? `${h}:${two(min)}:${two(s)}` : `${min}:${two(s)}`;
}

const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/** Expandable one-line blurb with a "more/less" toggle. */
function Blurb({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const teaser = teaserOf(text);
  const hasMore = teaser.length < text.trim().length;
  return (
    <p className="mt-2 flex-1 text-sm leading-relaxed text-white/60">
      {open ? text : teaser}
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
  );
}

/** 16:9 click-to-play video thumbnail with play-glyph overlay + optional duration badge. */
function VideoThumb({
  href,
  thumb,
  title,
  duration,
}: {
  href: string;
  thumb: string | null;
  title: string;
  duration?: string | null;
}) {
  const dur = fmtDuration(duration);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group/vid block overflow-hidden rounded-lg border border-white/10 transition-colors hover:border-brand-gold/40"
      title={title}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-surface-1">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            loading="lazy"
            width={480}
            height={270}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-300 group-hover/vid:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Youtube className="h-8 w-8 text-brand-gold/40" aria-hidden />
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/25 transition-colors group-hover/vid:bg-brand-gold/90">
            <Play className="ml-0.5 h-5 w-5 fill-current text-white group-hover/vid:text-text-inverse" />
          </span>
        </span>
        {dur ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[0.625rem] font-semibold tabular-nums text-white">
            {dur}
          </span>
        ) : null}
      </div>
    </a>
  );
}

/** Small round channel avatar chip (~36px), used beside the channel name. */
function AvatarChip({ src, name }: { src: string | null; name: string }) {
  return (
    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-1 ring-1 ring-white/10">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <Youtube className="h-4 w-4 text-brand-gold/50" aria-hidden />
        </span>
      )}
    </span>
  );
}

function OutboundPill({
  href,
  label,
  color,
  icon: Icon,
}: {
  href: string;
  label: string;
  color?: string;
  icon?: ComponentType<{ className?: string }>;
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

const cardCls =
  "flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-black/60 transition-colors hover:border-brand-gold/40";

/**
 * Watch card (a channel), Phase 6.3: led by the latest video's 16:9 thumbnail;
 * the channel logo demoted to a small avatar chip beside the name + subs. Falls
 * back to the avatar-led layout when no latest video resolves.
 */
function ChannelCard({ pick }: { pick: MediaPick }) {
  const hasVideo = Boolean(pick.latest?.videoId);
  return (
    <article className={cardCls}>
      {hasVideo ? (
        <div className="p-3 pb-0">
          <VideoThumb
            href={watchUrl(pick.latest!.videoId)}
            thumb={pick.latest!.thumb}
            title={pick.latest!.title}
          />
          <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-white/70">
            <span className="font-semibold text-white/45">Latest</span> · {pick.latest!.title}
          </p>
        </div>
      ) : (
        <MediaArt src={pick.image_url} alt={pick.name} kind="youtube" />
      )}

      <div className="flex flex-1 flex-col p-4 pt-3">
        <div className="flex items-center gap-2.5">
          {hasVideo ? <AvatarChip src={pick.image_url} name={pick.name} /> : null}
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold leading-snug text-text-primary">
              {pick.name}
            </h3>
            {fmtSubs(pick.subscriberCount) ? (
              <p className="text-[0.6875rem] text-white/45">{fmtSubs(pick.subscriberCount)}</p>
            ) : pick.creator ? (
              <p className="text-xs text-brand-gold/80">{pick.creator}</p>
            ) : null}
          </div>
        </div>

        <Blurb text={pick.blurb} />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={pick.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-brand-gold transition-colors hover:text-brand-gold-light"
          >
            {CTA.youtube}
            <ExternalLink className="h-3 w-3" />
          </a>
          <SubscribeButton channelId={pick.channelId} channelUrl={pick.url} />
          {pick.gear_link ? <OutboundPill href={pick.gear_link} label="Their kit" /> : null}
        </div>
      </div>
    </article>
  );
}

/** "Episodes We Love" card (a single curated video), Phase 6.5. */
function VideoCard({ pick }: { pick: MediaPick }) {
  const videoId = pick.links?.videoId ?? "";
  const channel = pick.creator;
  return (
    <article className={cardCls}>
      <div className="p-3 pb-0">
        <VideoThumb
          href={videoId ? watchUrl(videoId) : pick.url}
          thumb={pick.image_url}
          title={pick.name}
          duration={pick.links?.duration}
        />
      </div>
      <div className="flex flex-1 flex-col p-4 pt-3">
        <h3 className="text-base font-bold leading-snug text-text-primary">{pick.name}</h3>
        {channel ? (
          <p className="mt-0.5 text-xs text-brand-gold/80">
            {channel} <span className="text-white/40">· on YouTube</span>
          </p>
        ) : null}
        {pick.blurb ? <Blurb text={pick.blurb} /> : <div className="flex-1" />}
        <div className="mt-3">
          <a
            href={videoId ? watchUrl(videoId) : pick.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-brand-gold transition-colors hover:text-brand-gold-light"
          >
            {CTA.video}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </article>
  );
}

/** Book / podcast card (avatar-led). */
function Card({ pick }: { pick: MediaPick }) {
  return (
    <article className={cardCls}>
      <MediaArt src={pick.image_url} alt={pick.name} kind={pick.kind} />
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-base font-bold leading-snug text-text-primary">{pick.name}</h3>
        {pick.creator ? <p className="mt-0.5 text-xs text-brand-gold/80">{pick.creator}</p> : null}

        <Blurb text={pick.blurb} />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {pick.kind === "book" ? (
            <AffiliateLink href={pick.url} label={CTA.book} partner="amazon" product={pick.name} />
          ) : (
            <PodcastLinks pick={pick} />
          )}
          {pick.gear_link ? <OutboundPill href={pick.gear_link} label="Their kit" /> : null}
        </div>
      </div>
    </article>
  );
}

const PLATFORM_ICON: Record<string, ComponentType<{ className?: string }>> = {
  apple: ApplePodcastsIcon,
  spotify: SpotifyIcon,
  youtube: YouTubeMusicIcon,
  deezer: DeezerIcon,
  official: Globe,
  rss: Globe,
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

const GRID = "grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4";

export function MediaDirectory({
  picks,
}: {
  picks: { youtube: MediaPick[]; book: MediaPick[]; podcast: MediaPick[]; video: MediaPick[] };
}) {
  const [active, setActive] = useState<MediaKind>("youtube");

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

      {active === "youtube" ? (
        <>
          <div className={GRID}>
            {picks.youtube.map((pick) => (
              <ChannelCard key={pick.id} pick={pick} />
            ))}
          </div>

          {picks.video.length > 0 ? (
            <section className="mt-12">
              <div className="mb-4 border-t border-white/10 pt-8">
                <h2 className="text-xl font-bold text-text-primary">Episodes We Love</h2>
                <p className="mt-1 text-sm text-white/50">
                  Hand-picked single videos worth your time — credited to their channels.
                </p>
              </div>
              <div className={GRID}>
                {picks.video.map((pick) => (
                  <VideoCard key={pick.id} pick={pick} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <div className={GRID}>
          {picks[active].map((pick) => (
            <Card key={pick.id} pick={pick} />
          ))}
        </div>
      )}
    </div>
  );
}
