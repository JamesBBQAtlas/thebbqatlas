"use client";

import { useState } from "react";
import { GEAR_CATEGORY_ICONS } from "@/lib/constants/gear";
import type { GearCategory } from "@/lib/types/database";

/**
 * Product thumbnail. Official manufacturer photos sit on a light tile
 * (object-contain, so the whole product shows), and anything missing or that
 * fails to load falls back to the tasteful category icon — no broken boxes.
 */
export function GearImage({
  src,
  alt,
  category,
  size = "md",
}: {
  src: string | null;
  alt: string;
  category: GearCategory;
  size?: "md" | "sm";
}) {
  const [failed, setFailed] = useState(false);
  const Icon = GEAR_CATEGORY_ICONS[category];
  const showImage = Boolean(src) && !failed;
  const box = size === "sm" ? "h-16 w-16" : "h-24 w-24";
  const iconSize = size === "sm" ? "h-6 w-6" : "h-8 w-8";

  return (
    <div
      className={`${box} shrink-0 overflow-hidden rounded-xl ${
        showImage
          ? "border border-black/5 bg-white"
          : "grid place-items-center bg-surface-2"
      }`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- official brand CDNs; avoids per-host next/image config
        <img
          src={src as string}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-2"
        />
      ) : (
        <Icon className={`${iconSize} text-text-muted`} />
      )}
    </div>
  );
}
