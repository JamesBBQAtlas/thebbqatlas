"use client";

import { useEffect, useRef } from "react";
import { KONAMI_SEQUENCE, FREEBIRD_PHRASES } from "@/lib/eggs/registry";

/**
 * Global, site-wide Easter eggs that listen for keystrokes anywhere:
 *   • Konami code (↑↑↓↓←→←→BA) → a ~3s ember-rain washes the screen and settles.
 *   • typing "freebird" → the cursor trails an ember for ~10s, then fades.
 *
 * Everything is decorative and injected into one fixed, pointer-events-none,
 * aria-hidden overlay — so it never shifts layout, never traps focus, and costs
 * nothing until triggered. Fully skipped under prefers-reduced-motion. Listeners
 * only ever observe keys; they never call preventDefault, so typing is untouched.
 */
export function SiteEasterEggs() {
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return; // no motion effects for anyone who's asked us not to

    const konami = KONAMI_SEQUENCE.map((k) => k.toLowerCase());
    let kIdx = 0;
    let typed = "";
    const freebird = FREEBIRD_PHRASES.map((p) => p.toLowerCase());
    const longest = Math.max(...freebird.map((p) => p.length));

    let cursorUntil = 0;
    let lastEmber = 0;

    function makeEmber(className: string, x: number, y: number, extra?: Partial<CSSStyleDeclaration>) {
      const layer = layerRef.current;
      if (!layer) return null;
      const el = document.createElement("span");
      el.className = `egg-ember ${className}`;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      if (extra) Object.assign(el.style, extra);
      layer.appendChild(el);
      return el;
    }

    // ── Konami → ember-rain + a brief warm glow ──────────────────────────────
    function rain() {
      const layer = layerRef.current;
      if (!layer) return;
      const glow = document.createElement("div");
      glow.className = "egg-fire-glow";
      layer.appendChild(glow);
      window.setTimeout(() => glow.remove(), 3200);

      const count = 44;
      for (let i = 0; i < count; i++) {
        const el = makeEmber("egg-ember--fall", Math.random() * window.innerWidth, 0, {
          animationDuration: `${1.6 + Math.random() * 1.4}s`,
          animationDelay: `${Math.random() * 1.2}s`,
          width: `${4 + Math.random() * 5}px`,
          height: `${4 + Math.random() * 5}px`,
        });
        if (el) window.setTimeout(() => el.remove(), 3200);
      }
    }

    // ── freebird → ember trail behind the cursor for ~10s ────────────────────
    function onMouseMove(e: MouseEvent) {
      if (Date.now() > cursorUntil) return;
      if (Date.now() - lastEmber < 45) return; // throttle
      lastEmber = Date.now();
      const el = makeEmber("egg-ember--cursor", e.clientX, e.clientY);
      if (el) window.setTimeout(() => el.remove(), 850);
    }

    function onKeyDown(e: KeyboardEvent) {
      // Konami: match the arrow/B/A sequence (never intercept the keys).
      const key = e.key.toLowerCase();
      kIdx = key === konami[kIdx] ? kIdx + 1 : key === konami[0] ? 1 : 0;
      if (kIdx === konami.length) {
        kIdx = 0;
        rain();
      }

      // freebird: keep a short rolling buffer of typed letters.
      if (e.key.length === 1) {
        typed = (typed + key).slice(-longest);
        if (freebird.some((p) => typed.endsWith(p))) {
          cursorUntil = Date.now() + 10_000;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[70] overflow-hidden"
    />
  );
}
