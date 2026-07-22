import Image from "next/image";

/**
 * Branded, coded fallback shown when a venue has no photo (no approved upload
 * and no Instagram embed). It is NOT a blank grey box: crisp at any size, tinted
 * to the venue's BBQ-style colour, and clearly on-brand so it can never be
 * mistaken for a real photo of the venue's food. The venue hero renders an
 * "Add a photo" invitation on top of this to drive uploads.
 */
export function HeroPlaceholder({
  variant = "hero",
  styleColor = "#C4622D",
}: {
  variant?: "hero" | "card";
  styleColor?: string;
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
          isHero ? "top-[22%] h-28 w-28" : "top-[24%] h-16 w-16"
        } opacity-[0.12]`}
      >
        <Image
          src="/logos/crest-emblem.png"
          alt=""
          fill
          sizes="112px"
          className="object-contain"
        />
      </div>

      {!isHero && (
        <span className="absolute inset-x-0 bottom-3 text-center text-[0.625rem] uppercase tracking-[0.18em] text-text-muted/70">
          Photo coming soon
        </span>
      )}
    </div>
  );
}
