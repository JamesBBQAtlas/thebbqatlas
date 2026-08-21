import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// B5 — Content-Security-Policy. Allows exactly the origins the app talks to from the
// browser: self, Supabase (REST + realtime wss), MapTiler (map tiles/styles/sprites/
// glyphs, incl. blob workers), Google Analytics/Tag Manager, Stripe (checkout redirect
// + future Elements), and self-hosted @fontsource fonts. 'unsafe-inline' on script/style
// is required by GA's inline snippets, our JSON-LD blocks, Next's inline hydration, and
// MapLibre's runtime-injected styles; no 'unsafe-eval' (nothing needs it). frame-ancestors
// 'none' + X-Frame-Options DENY close the clickjacking hole Fable flagged (H2).
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://api.maptiler.com https://*.maptiler.com https://www.googletagmanager.com https://www.google-analytics.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.maptiler.com https://*.maptiler.com https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://api.stripe.com",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com",
  "form-action 'self' https://checkout.stripe.com",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // geolocation=(self): the directory/map use navigator.geolocation to sort by
    // distance. Everything else off. (HSTS is set at the Vercel layer.)
    value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), browsing-topics=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Copyright-safe VENUE imagery: only our own Supabase storage for venue
    // photos, and safeVenueImage() still blocks stock there. Unsplash is allowed
    // ONLY for EDITORIAL heroes (news/guides) — licensed stock used honestly,
    // never presented as a venue's own photo.
    remotePatterns: [
      { protocol: "https", hostname: "jsbhgsfnxrgcxlxsbokp.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  // B5 — security headers on every route (defense-in-depth: CSP, anti-clickjacking,
  // nosniff, referrer + permissions policy). See CSP/SECURITY_HEADERS above.
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // NOTE (F-20): host canonicalization (www ↔ apex) is handled at the Vercel /
  // DNS layer, NOT here. A code-level www→apex redirect fights Vercel's own
  // apex→www redirect and creates an infinite loop, so it must not live here.
  // To make the apex canonical, set thebbqatlas.com as the primary domain in
  // Vercel (so Vercel redirects www→apex). The canonical <link> tags already
  // point at the apex via metadataBase.
  async redirects() {
    return [
      // Part 6 (SEO) — consolidate the default-locale PREFIX duplicate. With
      // localePrefix "as-needed", the canonical form of every URL is UNPREFIXED
      // (/directory/…), but the prefixed form (/en-US/directory/…) can still resolve
      // and Google flagged the pair as "Duplicate without user-selected canonical".
      // A permanent redirect collapses the prefixed form onto the canonical one.
      // next.config redirects run BEFORE the next-intl middleware, and the destination
      // is unprefixed, so there is no loop (the target never re-matches the source).
      { source: "/en-US", destination: "/", permanent: true },
      { source: "/en-US/:path*", destination: "/:path*", permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
