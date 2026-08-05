import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidateGuides } from "@/lib/cache/guides";

export const dynamic = "force-dynamic";

/**
 * On-demand guides cache bust. Call after changing a guide's is_published /
 * published_at (the publish scheduler) to invalidate Next's cache AND purge
 * Cloudflare's edge copy of /guides and the affected /guides/[slug] — so a
 * change takes effect promptly instead of serving a stale cached page.
 *
 * Body (optional): { "slug": "..." } or { "slugs": ["...", "..."] }.
 * With no slug, refreshes just the /guides index.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const slugs: string[] = Array.isArray(body.slugs)
    ? body.slugs.map((s: unknown) => String(s)).filter(Boolean)
    : body.slug
      ? [String(body.slug)]
      : [];

  if (slugs.length) {
    for (const slug of slugs) await revalidateGuides(slug);
  } else {
    await revalidateGuides(null);
  }

  return NextResponse.json({ ok: true, revalidated: ["/guides", ...slugs.map((s) => `/guides/${s}`)] });
}
