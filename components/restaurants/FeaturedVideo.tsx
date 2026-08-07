"use client";

import { useState } from "react";
import { Play, ExternalLink } from "lucide-react";
import { logClick } from "@/lib/analytics/track";

/**
 * Phase 6.7 (B1) — a venue's featured video as a lightweight click-to-play
 * facade: render the thumbnail + a play button; load the YouTube iframe only
 * when the visitor clicks (keeps the venue page fast — no third-party player on
 * initial load). Uses the standard, unmodified embed once opened, with the video
 * title + "on YouTube: {channel}" attribution and a link back to watch on YT.
 */
export function FeaturedVideo({
  videoId,
  title,
  channel,
  thumb,
  restaurantId,
}: {
  videoId: string;
  title?: string | null;
  channel?: string | null;
  thumb?: string | null;
  restaurantId?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const poster =
    thumb ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  function play() {
    setPlaying(true);
    logClick({
      event_type: "media",
      restaurant_id: restaurantId ?? null,
      subtag: "featured-video",
      target_url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }

  return (
    <section className="mb-12">
      <h2 className="mb-5 border-b border-border-subtle pb-3 font-heading text-xl font-bold text-text-primary">
        Featured video
      </h2>
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-0">
        <div className="relative aspect-video w-full bg-black">
          {playing ? (
            <iframe
              className="absolute inset-0 h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
              title={title ?? "Featured video"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              onClick={play}
              aria-label={title ? `Play “${title}”` : "Play featured video"}
              className="group absolute inset-0 h-full w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={poster}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/15">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 ring-1 ring-white/30 transition-colors group-hover:bg-brand-gold/90">
                  <Play className="ml-1 h-7 w-7 fill-current text-white group-hover:text-text-inverse" />
                </span>
              </span>
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            {title ? (
              <p className="truncate text-sm font-semibold text-text-primary">{title}</p>
            ) : null}
            {channel ? (
              <p className="text-xs text-text-muted">on YouTube: {channel}</p>
            ) : null}
          </div>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-gold hover:text-brand-gold-light"
          >
            Watch on YouTube <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </section>
  );
}
