"use client";

import { ExternalLink } from "lucide-react";
import type { GearProduct } from "@/lib/types/database";
import { GearImage } from "@/components/gear/GearImage";
import { partnerLabel } from "@/lib/constants/gear";
import { usePathname } from "@/i18n/navigation";
import {
  buildSubtag,
  decorateAffiliateUrl,
  detectPartner,
  AMAZON_ONELINK_TAG,
} from "@/lib/affiliate";
import { logClick } from "@/lib/analytics/track";

/**
 * A single catalogue product. The WHOLE card is one affiliate link (image
 * included), so a click anywhere goes to the retailer — while keeping the
 * per-page attribution, click logging, and rel="sponsored nofollow" that every
 * affiliate link on the site carries. Shows the official manufacturer photo when
 * one is set (on a light tile), else a tasteful category-icon placeholder.
 */
export function GearProductCard({
  product,
  restaurantId,
  restaurantSlug,
}: {
  product: GearProduct;
  restaurantId?: string | null;
  restaurantSlug?: string;
}) {
  const pathname = usePathname();
  const label = `View on ${partnerLabel(product.partner)}`;
  const subtag = buildSubtag({
    restaurantSlug,
    pagePath: pathname,
    product: product.name,
  });
  const finalHref = decorateAffiliateUrl(
    product.affiliate_url,
    subtag,
    AMAZON_ONELINK_TAG
  );
  // Hard rule: if this product's link can't earn (foreign store / foreign tag),
  // do NOT render the card at all rather than ship a $0 buy control. The CI
  // tripwire fails the build before this, and the admin QA view lists the row.
  if (!finalHref) return null;
  const resolvedPartner = product.partner ?? detectPartner(product.affiliate_url);

  return (
    <a
      href={finalHref}
      target="_blank"
      rel="sponsored nofollow noopener noreferrer"
      data-affiliate={resolvedPartner}
      onClick={() =>
        logClick({
          event_type: "affiliate",
          restaurant_id: restaurantId ?? null,
          partner: resolvedPartner,
          target_url: finalHref,
          page_path: pathname,
          subtag,
        })
      }
      className="group flex gap-4 rounded-xl border border-border-subtle bg-surface-0 p-4 transition-all hover:border-border-default hover:shadow-lg"
    >
      <GearImage
        src={product.image_url}
        alt={product.name}
        category={product.category}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {product.brand && (
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-text-muted">
            {product.brand}
          </p>
        )}
        <h3 className="text-sm font-semibold leading-snug text-text-primary">
          {product.name}
        </h3>
        {product.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">
            {product.description}
          </p>
        )}
        <div className="mt-auto flex items-center gap-3 pt-2">
          <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-brand-gold transition-colors group-hover:text-brand-gold-light">
            {label}
            <ExternalLink className="h-3 w-3" />
          </span>
          {product.price_note && (
            <span className="text-xs text-text-muted">{product.price_note}</span>
          )}
        </div>
      </div>
    </a>
  );
}
