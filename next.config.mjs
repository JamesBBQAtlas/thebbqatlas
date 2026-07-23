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
  // NOTE (F-20): host canonicalization (www ↔ apex) is handled at the Vercel /
  // DNS layer, NOT here. A code-level www→apex redirect fights Vercel's own
  // apex→www redirect and creates an infinite loop, so it must not live here.
  // To make the apex canonical, set thebbqatlas.com as the primary domain in
  // Vercel (so Vercel redirects www→apex). The canonical <link> tags already
  // point at the apex via metadataBase.
};

export default withNextIntl(nextConfig);
