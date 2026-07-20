import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { getRestaurants } from "@/lib/queries/restaurants";
import { getGuides } from "@/lib/queries/guides";
import { getNews } from "@/lib/queries/news";

// Regenerate the sitemap hourly so new spots/guides appear without a redeploy.
export const revalidate = 3600;

const abs = (path: string) => `${SITE_URL}${path === "/" ? "" : path}`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [restaurants, guides, news] = await Promise.all([
    getRestaurants(),
    getGuides(),
    getNews(),
  ]);
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: abs("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: abs("/map"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: abs("/directory"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: abs("/guides"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: abs("/news"), lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: abs("/submit"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: abs("/privacy"), lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: abs("/terms"), lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: abs("/disclaimer"), lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  const restaurantEntries: MetadataRoute.Sitemap = restaurants.map((r) => ({
    url: abs(`/restaurants/${r.slug}`),
    lastModified: r.created_at ? new Date(r.created_at) : now,
    changeFrequency: "weekly",
    priority: r.is_featured ? 0.9 : 0.8,
  }));

  const guideEntries: MetadataRoute.Sitemap = guides.map((g) => ({
    url: abs(`/guides/${g.slug}`),
    lastModified: new Date(g.published_at || g.created_at || now),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const newsEntries: MetadataRoute.Sitemap = news.map((n) => ({
    url: abs(`/news/${n.slug}`),
    lastModified: new Date(n.published_at || n.created_at || now),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [
    ...staticEntries,
    ...restaurantEntries,
    ...guideEntries,
    ...newsEntries,
  ];
}
