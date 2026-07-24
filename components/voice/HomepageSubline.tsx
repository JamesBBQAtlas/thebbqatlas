"use client";

import { useEffect, useState } from "react";

type Line = { id: string; text: string };

// Shows on a fraction of visits; the default is no sub-line. Client-only and
// session-seeded, so it never enters the SSR HTML (keeps the SEO guardrail: no
// voice lines in the homepage <h1>/meta) and stays stable within a visit.
const SHOW_FRACTION = 0.4;

export function HomepageSubline({ lines }: { lines: Line[] }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!lines.length) return;
    const KEY = "bbqatlas.homeSub";
    try {
      const cached = sessionStorage.getItem(KEY);
      if (cached !== null) {
        setText(cached || null);
        return;
      }
    } catch {
      /* ignore */
    }
    const show = Math.random() < SHOW_FRACTION;
    const chosen = show
      ? lines[Math.floor(Math.random() * lines.length)].text
      : "";
    try {
      sessionStorage.setItem(KEY, chosen);
    } catch {
      /* ignore */
    }
    setText(chosen || null);
  }, [lines]);

  if (!text) return null;
  return (
    <p className="mx-auto mt-4 max-w-xl text-sm font-medium italic text-brand-gold/90">
      {text}
    </p>
  );
}
