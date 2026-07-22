import Image from "next/image";
import { safeVenueImage } from "@/lib/restaurants/image";

/**
 * Editorial (guide/news) cover image with a branded fallback. Renders the image
 * when it's a real, hosted source; when it's missing or a stock/hotlinked URL
 * (which fails in production), it shows an on-brand ember placeholder instead of
 * a broken/empty box. Fills its (relative, sized) parent.
 */
export function EditorialImage({
  src,
  alt,
  sizes,
  priority,
}: {
  src?: string | null;
  alt: string;
  sizes?: string;
  priority?: boolean;
}) {
  const safe = safeVenueImage(src);
  if (safe) {
    return (
      <Image
        src={safe}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    );
  }
  return (
    <div className="absolute inset-0 overflow-hidden bg-surface-1">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 118%, rgba(196,98,45,0.42) 0%, rgba(196,98,45,0.13) 32%, transparent 62%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(115deg, #fff 0 1px, transparent 1px 22px)",
        }}
      />
      <span className="absolute inset-x-0 bottom-3 text-center font-heading text-[0.625rem] uppercase tracking-[0.2em] text-text-muted/70">
        The BBQ Atlas
      </span>
    </div>
  );
}
