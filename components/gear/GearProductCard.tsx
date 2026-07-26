import type { GearProduct } from "@/lib/types/database";
import { AffiliateLink } from "@/components/monetization/AffiliateLink";
import { GearImage } from "@/components/gear/GearImage";
import { partnerLabel } from "@/lib/constants/gear";

/**
 * A single catalogue product. Shows the official manufacturer photo when one is
 * set (on a light tile), else a tasteful category-icon placeholder.
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
  return (
    <div className="flex gap-4 rounded-xl border border-border-subtle bg-surface-0 p-4 transition-all hover:border-border-default hover:shadow-lg">
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
