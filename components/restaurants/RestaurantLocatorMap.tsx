import { Link } from "@/i18n/navigation";

interface NearbyPoint {
  lat: number;
  lng: number;
}

/**
 * Lightweight zero-JS locator map. Plots the restaurant (pulsing gold pin) and
 * nearby Atlas spots (sienna dots) by true relative geography, auto-scaled to
 * fit. Renders instantly on the server — no map tiles, ideal for Core Web
 * Vitals — and links out to the full interactive map for street-level detail.
 */
export function RestaurantLocatorMap({
  lat,
  lng,
  nearby,
  caption,
  fullMapHref = "/map",
}: {
  lat: number;
  lng: number;
  nearby: NearbyPoint[];
  caption?: string;
  fullMapHref?: string;
}) {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const raw = nearby.map((n) => ({
    dx: (n.lng - lng) * cosLat,
    dy: n.lat - lat,
  }));
  const maxR = Math.max(0.00001, ...raw.map((p) => Math.hypot(p.dx, p.dy)));
  const frameR = 24; // viewBox units of headroom around the center
  const scale = frameR / maxR;
  const placed = raw.map((p) => ({
    x: 50 + p.dx * scale,
    y: 31 - p.dy * scale, // invert: north is up
  }));

  return (
    <div className="relative overflow-hidden rounded-xl border border-border-subtle">
      <div className="relative aspect-[16/10] w-full bg-[radial-gradient(circle_at_50%_45%,rgba(212,175,55,0.14),transparent_46%),linear-gradient(135deg,#151210,#0E0C0A)]">
        <svg
          viewBox="0 0 100 62"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          {/* range rings */}
          {[10, 18, 26].map((r) => (
            <circle
              key={r}
              cx="50"
              cy="31"
              r={r}
              fill="none"
              stroke="#3D2E24"
              strokeWidth="0.3"
              opacity="0.5"
            />
          ))}
          {/* crosshair */}
          <line x1="50" y1="4" x2="50" y2="58" stroke="#3D2E24" strokeWidth="0.2" opacity="0.4" />
          <line x1="14" y1="31" x2="86" y2="31" stroke="#3D2E24" strokeWidth="0.2" opacity="0.4" />
          {/* nearby spots */}
          {placed.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="2.6" fill="#C4622D" opacity="0.18" />
              <circle cx={p.x} cy={p.y} r="1.3" fill="#D87A45" />
            </g>
          ))}
        </svg>

        {/* pulsing gold pin at the restaurant */}
        <div className="pointer-events-none absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-full">
          <div className="h-3 w-3 rounded-full bg-brand-gold shadow-glow-gold" />
        </div>
        <span className="pointer-events-none absolute left-1/2 top-[45%] h-7 w-7 -translate-x-1/2 -translate-y-1/2 animate-ping-slow rounded-full border-2 border-brand-gold/30" />

        {caption && (
          <span className="pointer-events-none absolute bottom-2 left-3 text-[0.6875rem] uppercase tracking-[0.08em] text-text-muted">
            {caption}
          </span>
        )}
        <Link
          href={fullMapHref}
          className="absolute bottom-2 right-3 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-brand-gold/90 transition-colors hover:text-brand-gold"
        >
          Full map →
        </Link>
      </div>
    </div>
  );
}
