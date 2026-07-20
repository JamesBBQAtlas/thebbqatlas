import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED, GrokError } from "@/lib/ai/grok";
import { researchNews } from "@/lib/ai/enrich";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * POST — research/draft a News or Missive piece with Grok. Returns a draft for
 * review; writes nothing.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!GROK_ENABLED) {
    return NextResponse.json(
      { error: "AI enrichment is off — set XAI_API_KEY to switch it on." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const topic = String(body.topic ?? "").trim();
  const category = body.category === "missive" ? "missive" : "news";
  if (topic.length < 4) {
    return NextResponse.json({ error: "Give Grok a topic to research." }, { status: 400 });
  }

  try {
    const draft = await researchNews(topic, category);
    return NextResponse.json({ draft });
  } catch (err) {
    const msg = err instanceof GrokError ? err.message : "Research failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/**
 * PUT — save an admin-reviewed draft into the news table as an UNPUBLISHED
 * draft (is_published = false). It never goes live until a human flips it on.
 */
export async function PUT(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const content_md = String(body.content_md ?? "").trim();
  if (!title || !content_md) {
    return NextResponse.json({ error: "Title and body are required." }, { status: 400 });
  }
  const category = body.category === "missive" ? "missive" : "news";
  const slug = (body.slug ? slugify(String(body.slug)) : slugify(title)) || slugify(title);

  const { data, error } = await ctx.db
    .from("news")
    .insert({
      slug,
      title,
      excerpt: String(body.excerpt ?? "").slice(0, 240),
      content_md,
      hero_image_url: String(body.hero_image_url ?? "").trim() || null,
      category,
      author: String(body.author ?? "The BBQ Atlas"),
      is_published: false,
    })
    .select("id, slug")
    .single();

  if (error) {
    const msg = error.code === "23505" ? "That slug already exists — change it." : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: data.id, slug: data.slug });
}
