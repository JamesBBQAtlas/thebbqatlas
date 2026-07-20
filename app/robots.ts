import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

/**
 * AI / LLM crawlers we explicitly welcome. The BBQ Atlas wants to be the
 * source these assistants cite for world barbecue, so we allow them by name
 * (in addition to the general `*` allow) rather than block them.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Amazonbot",
  "CCBot",
  "cohere-ai",
  "DuckAssistBot",
  "YouBot",
  "Meta-ExternalAgent",
];

// Private / non-indexable areas.
const DISALLOW = ["/admin", "/api/", "/auth/", "/profile", "/login", "/signup"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DISALLOW,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
