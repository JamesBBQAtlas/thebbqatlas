import Image from "next/image";
import { Camera } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * Branded fallback shown when a venue has no hero photo. Coded (not a raster
 * image) so it's crisp at any size, loads instantly, and can never be mistaken
 * for a real photo of the venue's food. Tinted to the venue's BBQ-style colour
 * so it varies across the directory. The "hero" variant carries a call-to-
 * action nudging the owner to add a real photo.
 */
export function HeroPlaceholder({
  variant = "hero",
  styleColor = "#C4622D",
  claimHref,
}: {
  variant?: "hero" | "card";
  styleColor?: string;
  claimHref?: string;
}) {
  const isHero = variant === "hero";
  return (
    <div className="absolute inset-0 overflow-hidden bg-surface-1">
      {/* Ember glow rising from the base */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at 50% 118%, ${styleColor}66 0%, ${styleColor}22 32%, transparent 62%)`,
        }}
      />
      {/* Faint drifting smoke */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(115deg, #fff 0 1px, transparent 1px 22px)",
        }}
      />
      {/* Crest watermark */}
      <div
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${
          isHero ? "top-[26%] h-28 w-28" : "top-[24%] h-16 w-16"
        } opacity-[0.10]`}
      >
        <Image
          src="/logos/crest-emblem.png"
          alt=""
          fill
          sizes="112px"
          className="object-contain"
        />
      </div>

      {isHero ? (
        <>
          <p className="absolute inset-x-0 top-[52%] text-center font-heading text-sm uppercase tracking-[0.2em] text-text-muted">
            The BBQ Atlas
          </p>
          {claimHref && (
            <Link
              href={claimHref}
              className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface-0/70 px-3.5 py-1.5 text-xs font-semibold text-text-secondary backdrop-blur-sm transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
            >
              <Camera className="h-3.5 w-3.5" />
              Own this venue? Add a photo
            </Link>
          )}
        </>
      ) : (
        <span className="absolute inset-x-0 bottom-3 text-center text-[0.625rem] uppercase tracking-[0.18em] text-text-muted/70">
          Photo coming soon
        </span>
      )}
    </div>
  );
}
