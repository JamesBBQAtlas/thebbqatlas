import type { MetadataRoute } from "next";

/**
 * PWA manifest — makes The BBQ Atlas installable ("Add to Home Screen") and
 * launchable as a standalone, app-like experience. Route-generated so it lives
 * at /manifest.webmanifest automatically.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The BBQ Atlas",
    short_name: "BBQ Atlas",
    description:
      "A curated global atlas of the world's great barbecue — explore the map, read the guides, celebrate the craft.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c0907",
    theme_color: "#0c0907",
    categories: ["food", "travel", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
