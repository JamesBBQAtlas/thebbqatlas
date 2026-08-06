"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Animated "there's more below" cue at the bottom of the mobile hero — a thin
 * gold line with a travelling pulse (inspired by the flashing scroll line on
 * BostonWarwick.com) plus a small chevron. Subtle, on-brand, and it hides the
 * moment the visitor scrolls. Mobile only (desktop hero already fits). Purely
 * decorative + pointer-events-none, and it respects reduced-motion via CSS.
 */
export function ScrollCue() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 24) setHidden(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (hidden) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex flex-col items-center gap-1 sm:hidden"
    >
      <span className="scroll-cue-line" />
      <ChevronDown className="h-4 w-4 animate-pulse-slow text-brand-gold/80" />
    </div>
  );
}
