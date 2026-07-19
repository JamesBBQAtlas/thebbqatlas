import type { Restaurant } from "@/lib/types/database";

/**
 * Zero-JS world-scatter visual for the homepage map teaser. Projects every
 * real restaurant onto an equirectangular frame as a glowing dot (gold =
 * featured, sienna = standard). No tiles — instant, on-brand, and it makes the
 * "barbecue has no borders" point with actual data.
 */
export function HomeMapVisual({ restaurants }: { restaurants: Restaurant[] }) {
  const pts = restaurants
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .map((r) => ({
      x: ((r.lng + 180) / 360) * 100,
      y: ((90 - r.lat) / 180) * 100,
      featured: r.is_featured,
    }));

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border-default bg-[radial-gradient(circle_at_30%_45%,rgba(212,175,55,0.12),transparent_32%),radial-gradient(circle_at_70%_55%,rgba(196,98,45,0.1),transparent_30%),linear-gradient(135deg,#151210,#0E0C0A)]">
      {/* faint graticule */}
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(#5A4838 1px, transparent 1px), linear-gradient(90deg, #5A4838 1px, transparent 1px)",
          backgroundSize: "12.5% 16.66%",
        }}
      />
      {pts.map((p, i) => (
        <span
          key={i}
          className={
            p.featured
              ? "absolute h-2 w-2 rounded-full bg-brand-gold shadow-[0_0_10px_rgba(212,175,55,0.6)]"
              : "absolute h-1.5 w-1.5 rounded-full bg-brand-sienna shadow-[0_0_8px_rgba(196,98,45,0.5)]"
          }
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
}
