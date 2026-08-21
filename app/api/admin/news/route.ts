import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidatePath } from "next/cache";
import { videoIdFrom } from "@/lib/media/youtube";

export const dynamic = "force-dynamic";

const CATEGORIES = new Set(["news", "missive"]);

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Validate + normalise a news patch. requireCore=true for create. */
function clean(body: Record<string, unknown>, requireCore: boolean) {
  const out: Record<string, unknown> = {};
  const str = (k: string, max: number) => {
    if (body[k] !== undefined) {
      const v = String(body[k] ?? "").trim();
      out[k] = v ? v.slice(0, max) : null;
    }
  };

  if (body.title !== undefined) {
    const t = String(body.title ?? "").trim();
    if (t) out.title = t.slice(0, 200);
    else if (requireCore) return { error: "Title is required." };
  } else if (requireCore) return { error: "Title is required." };

  // Slug: explicit, else derived from title on create.
  if (body.slug !== undefined && String(body.slug).trim()) {
    out.slug = slugify(String(body.slug));
  } else if (requireCore) {
    out.slug = slugify(String(out.title ?? ""));
  }

  str("excerpt", 500);
  str("content_md", 40000);
  str("hero_image_url", 2048);
  str("author", 120);

  if (body.category !== undefined) {
    const c = String(body.category);
    if (!CATEGORIES.has(c)) return { error: "Category must be news or missive." };
    out.category = c;
  } else if (requireCore) {
    out.category = "missive";
  }

  if (body.featured_video_id !== undefined) {
    const raw = String(body.featured_video_id ?? "").trim();
    out.featured_video_id = raw ? videoIdFrom(raw) : null;
  }

  if (body.is_published !== undefined) out.is_published = Boolean(body.is_published);

  return { patch: out };
}

export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const { patch, error } = clean(body, true);
  if (error || !patch) {
    return NextResponse.json({ error: error ?? "Invalid post." }, { status: 400 });
  }
  // A published post needs a published_at; drafts don't.
  if (patch.is_published && !patch.published_at) patch.published_at = new Date().toISOString();
  const { data, error: dbErr } = await ctx.db
    .from("news")
    .insert(patch)
    .select("id, slug")
    .single();
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  revalidatePath("/news");
  if (data?.slug) revalidatePath(`/news/${data.slug}`);
  return NextResponse.json({ ok: true, id: data?.id, slug: data?.slug });
}

export async function PATCH(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { patch, error } = clean(body, false);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!patch || Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  // First-time publish → stamp published_at if it isn't already set.
  if (patch.is_published === true) {
    const { data: existing } = await ctx.db
      .from("news")
      .select("published_at")
      .eq("id", id)
      .single();
    if (!existing?.published_at) patch.published_at = new Date().toISOString();
  }
  const { error: dbErr } = await ctx.db.from("news").update(patch).eq("id", id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  revalidatePath("/news");
  if (patch.slug) revalidatePath(`/news/${patch.slug}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { error } = await ctx.db.from("news").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  revalidatePath("/news");
  return NextResponse.json({ ok: true });
}
