import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** GET ?slug= — look up a brand by slug. */
export async function GET(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const slug = new URL(request.url).searchParams.get("slug")?.trim();
  if (!slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 });

  const { data } = await ctx.db.from("brands").select("*").eq("slug", slug).maybeSingle();
  if (!data) return NextResponse.json({ error: "No brand with that slug." }, { status: 404 });
  return NextResponse.json({ brand: data });
}

/**
 * POST — resolve-or-create a brand by name (or slug). Returns { id, slug } so
 * the console can then attach a venue to it. Idempotent on slug.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Brand name required." }, { status: 400 });
  const slug = (body.slug ? slugify(String(body.slug)) : slugify(name)) || slugify(name);

  // Return the existing brand if one already has this slug.
  const { data: existing } = await ctx.db
    .from("brands")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) return NextResponse.json({ id: existing.id, slug: existing.slug, created: false });

  const insert: Record<string, unknown> = { slug, name };
  for (const k of [
    "description",
    "website",
    "instagram_url",
    "x_url",
    "facebook_url",
    "tiktok_url",
    "youtube_url",
  ]) {
    if (body[k]) insert[k] = String(body[k]);
  }

  const { data, error } = await ctx.db
    .from("brands")
    .insert(insert)
    .select("id, slug")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ id: data.id, slug: data.slug, created: true });
}
