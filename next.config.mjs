import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Copyright-safe imagery: only our own Supabase storage is an allowed remote
    // source. Stock hosts (Unsplash/Pexels) are intentionally NOT allowed — we
    // never present stock as a venue's own photo (see safeVenueImage()).
    remotePatterns: [
      { protocol: "https", hostname: "jsbhgsfnxrgcxlxsbokp.supabase.co" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  // Canonical host is the apex (F-20): 301 www → apex so it's code-owned, not
  // only a DNS/hosting concern.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.thebbqatlas.com" }],
        destination: "https://thebbqatlas.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
