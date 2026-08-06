import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

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
  // NOTE (F-20): host canonicalization (www ↔ apex) is handled at the Vercel /
  // DNS layer, NOT here. A code-level www→apex redirect fights Vercel's own
  // apex→www redirect and creates an infinite loop, so it must not live here.
  // To make the apex canonical, set thebbqatlas.com as the primary domain in
  // Vercel (so Vercel redirects www→apex). The canonical <link> tags already
  // point at the apex via metadataBase.
};

export default withNextIntl(nextConfig);
