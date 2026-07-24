"use client";

import { useEffect, useState } from "react";
import { Link2, Check } from "lucide-react";

type Line = { id: string; text: string; tag: string | null };

/**
 * Footer egg — one element, three behaviours (Ron Swanson flip):
 *  1. Ambient: a footer voice-bank line, seeded per session (stable within a
 *     visit, fresh next visit).
 *  2. Click to flip: advances lines; after the first click reveals a subtle
 *     "copy link" that writes the current line into the URL (?ron / ?line=id).
 *  3. Pinned: an incoming ?ron / ?line param renders that exact line (wins).
 * Cosmetic only; never touches the real footer links; clipboard is progressive
 * enhancement.
 */
export function FooterTagline({
  lines,
  fallback,
}: {
  lines: Line[];
  fallback?: string;
}) {
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!lines.length) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("ron")) {
      const i = lines.findIndex((l) => l.tag === "ron");
      if (i >= 0) {
        setIdx(i);
        setReady(true);
        return;
      }
    }
    const lineId = params.get("line");
    if (lineId) {
      const i = lines.findIndex((l) => l.id === lineId);
      if (i >= 0) {
        setIdx(i);
        setReady(true);
        return;
      }
    }
    const KEY = "bbqatlas.footerLine";
    let stored: number | null = null;
    try {
      const v = sessionStorage.getItem(KEY);
      if (v != null) stored = parseInt(v, 10);
    } catch {
      /* sessionStorage unavailable — fall through to a fresh pick */
    }
    if (stored != null && stored >= 0 && stored < lines.length) {
      setIdx(stored);
    } else {
      const pick = Math.floor(Math.random() * lines.length);
      setIdx(pick);
      try {
        sessionStorage.setItem(KEY, String(pick));
      } catch {
        /* ignore */
      }
    }
    setReady(true);
  }, [lines]);

  if (!lines.length) {
    return fallback ? (
      <p className="mt-4 font-heading text-base italic text-brand-gold">
        {fallback}
      </p>
    ) : null;
  }

  const line = lines[idx];

  function flip() {
    setInteracted(true);
    setIdx((i) => (i + 1) % lines.length);
  }

  async function copy() {
    const cur = lines[idx];
    const url = new URL(window.location.href);
    url.searchParams.delete("ron");
    url.searchParams.delete("line");
    if (cur.tag === "ron") url.searchParams.set("ron", "");
    else url.searchParams.set("line", cur.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — no-op (progressive enhancement) */
    }
  }

  return (
    <span className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={flip}
        title="A little something from the Atlas — tap to flip"
        className={`text-left font-heading text-base italic text-brand-gold transition-opacity duration-200 hover:opacity-80 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
      >
        {line.text}
      </button>
      {interacted && (
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-text-muted transition-colors hover:text-brand-gold"
        >
          {copied ? <Check className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      )}
    </span>
  );
}
