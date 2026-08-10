"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@/i18n/navigation";
import { STYLE_DESCRIPTIONS, STYLE_LABELS, type BbqStyle } from "@/lib/constants/styles";

/**
 * Part H — a BBQ-style chip that EXPLAINS the style in place instead of bouncing
 * the user to the style hub mid-browse. Tapping/activating the chip opens a small
 * popover with the one-line description (reused verbatim from STYLE_DESCRIPTIONS —
 * the single source of truth) plus a deliberate "Explore …" link for anyone who
 * genuinely wants the hub.
 *
 * Accessible: the trigger is a real button with aria-expanded/aria-controls,
 * keyboard-operable (Enter/Space to open, Esc to close), and dismissible by
 * tapping away. Works on touch (tap to open, tap-away to close), not just hover.
 *
 * The panel renders through a PORTAL to <body>, so the chip can live inside a
 * card that is itself an <a> without nesting anchors/buttons illegally, and the
 * popover is never clipped by the card's overflow.
 */
const DEFAULT_CHIP =
  "rounded-full border border-brand-sienna bg-brand-sienna/10 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-brand-sienna transition-colors hover:bg-brand-sienna/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-gold";

export function StyleChip({
  style,
  className,
}: {
  style: BbqStyle;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const label = STYLE_LABELS[style] ?? style;
  const desc = STYLE_DESCRIPTIONS[style] ?? STYLE_DESCRIPTIONS.other;

  // Position the portal panel under the chip (fixed to the viewport). Runs after
  // the click that opens it, so useEffect (not useLayoutEffect) avoids an SSR warning.
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 6, left: r.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !panelRef.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const toggle = (e: React.SyntheticEvent) => {
    // Never let the chip trigger the surrounding card's navigation.
    e.preventDefault();
    e.stopPropagation();
    setOpen((o) => !o);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${label} barbecue — what is it?`}
        title={desc}
        onClick={toggle}
        className={className ?? DEFAULT_CHIP}
      >
        {label}
      </button>
      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={`${label} barbecue`}
            style={{ position: "fixed", top: coords.top, left: coords.left, zIndex: 60 }}
            className="w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border-default bg-surface-1 p-3 text-left shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-brand-sienna">
              {label}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{desc}</p>
            <Link
              href={`/styles/${style}`}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-gold hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Explore {label} spots →
            </Link>
          </div>,
          document.body
        )}
    </>
  );
}
