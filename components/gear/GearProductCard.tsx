import type { GearProduct } from "@/lib/types/database";
import { AffiliateLink } from "@/components/monetization/AffiliateLink";
import { GEAR_CATEGORY_ICONS, partnerLabel } from "@/lib/constants/gear";

/**
 * A single catalogue product. Shows the official product image when one is set,
 * else a tasteful category-icon placeholder (we never scrape/hotlink imagery —
 * image_url is populated only with official affiliate assets, in admin).
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
  const Icon = GEAR_CATEGORY_ICONS[product.category];
  return (
    <div className="flex gap-4 rounded-xl border border-border-subtle bg-surface-0 p-4 transition-colors hover:border-border-default">
      <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary official
          // affiliate hosts; avoids per-host next/image remotePattern config.
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <Icon className="h-6 w-6 text-text-muted" />
        )}
      </div>
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
          <AffiliateLink
            href={product.affiliate_url}
            label={`View on ${partnerLabel(product.partner)}`}
            partner={product.partner ?? undefined}
            product={product.name}
            restaurantId={restaurantId}
            restaurantSlug={restaurantSlug}
          />
          {product.price_note && (
            <span className="text-xs text-text-muted">{product.price_note}</span>
          )}
        </div>
      </div>
    </div>
  );
}
