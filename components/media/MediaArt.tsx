"use client";

import { useState } from "react";
import { Youtube, BookOpen, Podcast } from "lucide-react";
import type { MediaKind } from "@/lib/queries/media-picks";

const GLYPH = { youtube: Youtube, book: BookOpen, podcast: Podcast, video: Youtube } as const;

/**
 * Cover art for a media pick with a branded fallback. Uses a plain <img> (the
 * sources — Open Library, iTunes artwork — aren't in next/image's allowlist and
 * are cached upstream anyway); on 404/empty it shows an on-brand ember
 * placeholder with the kind glyph instead of a broken image.
 */
export function MediaArt({
  src,
  alt,
  kind,
}: {
  src: string | null;
  alt: string;
  kind: MediaKind;
}) {
  const [failed, setFailed] = useState(false);
  const Glyph = GLYPH[kind];
  const showImg = src && !failed;

  return (
    <div className="relative aspect-square w-full overflow-hidden bg-surface-1">
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          // YouTube channel avatars (yt3.ggpht.com) refuse to load cross-origin
          // when a referrer is sent — no-referrer makes them render instead of
          // hanging as broken images (Fable H-2). Harmless for iTunes/Google covers.
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 118%, rgba(196,98,45,0.42) 0%, rgba(196,98,45,0.13) 32%, transparent 62%)",
          }}
        >
          <Glyph className="h-10 w-10 text-brand-gold/50" aria-hidden />
        </div>
      )}
    </div>
  );
}
