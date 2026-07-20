"use client";

import { useEffect } from "react";

/**
 * Renders official Instagram post embeds via Instagram's own embed.js. This is
 * the ToS-compliant way to show a venue's photos: Instagram serves the content
 * from public posts and attributes it to the venue — we never copy or re-host
 * their images. Only public post/reel permalinks work.
 */
declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

export function InstagramEmbed({ posts }: { posts: string[] }) {
  useEffect(() => {
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
  }, [posts]);

  if (!posts?.length) return null;

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
