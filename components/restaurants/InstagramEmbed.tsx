"use client";

import { useEffect, useState } from "react";
import { Instagram } from "lucide-react";

/**
 * Renders official Instagram post embeds via Instagram's own embed.js — the
 * ToS-compliant way to show a venue's photos (Instagram serves and attributes
 * the content; we never copy or re-host it). Only public post/reel permalinks
 * work.
 *
 * F-27: embed.js sets Meta cookies, so we gate it behind a click-to-load facade.
 * Nothing loads from Instagram until the visitor explicitly asks for it.
 */
declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

export function InstagramEmbed({ posts }: { posts: string[] }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    const id = "instagram-embed-js";
    const process = () => window.instgrm?.Embeds?.process();
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      process();
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.async = true;
    s.src = "https://www.instagram.com/embed.js";
    s.onload = process;
    document.body.appendChild(s);
  }, [posts, loaded]);

  if (!posts?.length) return null;

  if (!loaded) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-1/40 p-6 text-center">
        <Instagram className="mx-auto mb-2 h-6 w-6 text-brand-gold" />
        <p className="text-sm text-text-secondary">
          {posts.length} Instagram {posts.length === 1 ? "post" : "posts"} from
          this venue.
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-text-muted">
          Loading them contacts Instagram and may set their cookies.
        </p>
        <button
          type="button"
          onClick={() => setLoaded(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90"
        >
          <Instagram className="h-4 w-4" />
          Show Instagram posts
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
      {posts.map((url) => (
        <blockquote
          key={url}
          className="instagram-media"
          data-instgrm-permalink={url}
          data-instgrm-version="14"
          style={{
            background: "transparent",
            border: 0,
            margin: 0,
            maxWidth: 328,
            minWidth: 260,
            width: "100%",
          }}
        />
      ))}
    </div>
  );
}
