"use client";

import { ExternalLink } from "lucide-react";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";
import {
  buildSubtag,
  decorateAffiliateUrl,
  detectPartner,
  AMAZON_ONELINK_TAG,
} from "@/lib/affiliate";
import { logClick } from "@/lib/analytics/track";

/**
 * Every affiliate link on the site goes through here, so per-page/per-restaurant
 * attribution is guaranteed. Builds the subtag from the current page (or the
 * restaurant it belongs to), decorates the URL (Amazon ascsubtag / utm subid),
 * and logs a click_event on activation.
 */
export function AffiliateLink({
  href,
  label,
  partner,
  restaurantId,
  restaurantSlug,
  product,
  className,
}: {
  href: string;
  label: string;
  partner?: string;
  restaurantId?: string | null;
  restaurantSlug?: string;
  product?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const subtag = buildSubtag({ restaurantSlug, pagePath: pathname, product: product ?? label });
  const amazonTag = AMAZON_ONELINK_TAG;
  const finalHref = decorateAffiliateUrl(href, subtag, amazonTag);
  const resolvedPartner = partner ?? detectPartner(href);

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
      className={cn(
        "inline-flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-brand-gold transition-colors hover:text-brand-gold-light",
        className
      )}
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
