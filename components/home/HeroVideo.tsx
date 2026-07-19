"use client";

import { useEffect, useState } from "react";

/**
 * Cinematic hero background. Server/first paint and mobile/reduced-motion get
 * the lightweight poster (great for LCP); desktops with motion allowed upgrade
 * to the muted, looping video — per the design spec's performance rules.
 */
export function HeroVideo({
  poster,
  webm,
  mp4,
}: {
  poster: string;
  webm?: string;
  mp4: string;
}) {
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(
      "(min-width: 768px) and (prefers-reduced-motion: no-preference)"
    );
    const update = () => setPlay(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  if (!play) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={poster}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  return (
    <video
      autoPlay
      muted
      loop
      playsInline
      poster={poster}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover"
    >
      {webm && <source src={webm} type="video/webm" />}
      <source src={mp4} type="video/mp4" />
    </video>
  );
}
