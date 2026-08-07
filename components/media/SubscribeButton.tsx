"use client";

import { useEffect, useRef, useState } from "react";
import { Youtube } from "lucide-react";

/** Channel URL with the subscribe-confirmation prompt appended (no-JS default). */
const subscribeUrl = (url: string): string =>
  url + (url.includes("?") ? "&" : "?") + "sub_confirmation=1";

// Load Google's platform.js exactly once, lazily. Resolves even on error so the
// card always falls back to the deep link rather than hanging.
let platformPromise: Promise<void> | null = null;
function loadPlatform(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (platformPromise) return platformPromise;
  platformPromise = new Promise<void>((resolve) => {
    if (document.getElementById("gapi-platform")) return resolve();
    const s = document.createElement("script");
    s.id = "gapi-platform";
    s.src = "https://apis.google.com/js/platform.js";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return platformPromise;
}

type Gapi = { ytsubscribe?: { go?: (el?: HTMLElement) => void } };

/**
 * In-page YouTube subscribe (Phase 6.4). Primary: the official g-ytsubscribe
 * widget, with platform.js deferred until the card scrolls into view (no eager
 * load, no CWV cost). Fallback (and no-JS default): the ?sub_confirmation=1 deep
 * link. The widget needs a channel id; with only a handle we show the deep link.
 */
export function SubscribeButton({
  channelId,
  channelUrl,
}: {
  channelId: string | null | undefined;
  channelUrl: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!channelId) return;
    const el = hostRef.current;
    if (!el) return;
    let loaded = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!loaded && entries.some((e) => e.isIntersecting)) {
          loaded = true;
          io.disconnect();
          loadPlatform().then(() => setReady(true));
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [channelId]);

  useEffect(() => {
    if (!ready || !widgetRef.current) return;
    const g = (window as unknown as { gapi?: Gapi }).gapi;
    try {
      g?.ytsubscribe?.go?.(widgetRef.current);
    } catch {
      /* widget failed — the deep-link fallback is still visible on the card */
    }
  }, [ready]);

  const fallback = (
    <a
      href={subscribeUrl(channelUrl)}
      target="_blank"
      rel="noopener noreferrer"
      style={{ borderColor: "#FF000066", color: "#FF0000" }}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.6875rem] font-semibold transition-colors hover:bg-white/[0.06]"
    >
      <Youtube className="h-3 w-3" /> Subscribe
    </a>
  );

  if (!channelId) return fallback;

  return (
    <div ref={hostRef} className="inline-flex items-center">
      {ready ? (
        <div
          ref={widgetRef}
          className="g-ytsubscribe"
          data-channelid={channelId}
          data-layout="full"
          data-count="default"
        />
      ) : (
        fallback
      )}
    </div>
  );
}
