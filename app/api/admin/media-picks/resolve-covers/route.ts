import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidatePath } from "next/cache";
import { resolveBookCover } from "@/lib/media/book-cover";

export const dynamic = "force-dynamic";
// Sequential backfill of up to ~32 books — give it headroom past the default.
export const maxDuration = 60;

/**
 * Backfill book cover art ONCE and persist it to media_picks.image_url, so the
 * public page renders covers straight from storage — no per-render external
 * fetch, no Google Books rate-limit exposure. Resolves sequentially with a
 * small delay between calls to stay well under the keyless quota. By default
 * only fills books whose image_url is null; pass { force: true } to re-resolve
 * every book (e.g. to refresh a stale/hand-set cover).
 *
 * Returns { resolved: [{name}], unresolved: [{name, url}] } so the admin can
 * hand-set any the matcher couldn't confidently place. We never persist a
 * wrong cover: resolveBookCover title-validates and returns null on no match,
 * which we leave as null (placeholder) rather than guessing.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  const force = Boolean(body.force);

  let query = ctx.db
    .from("media_picks")
    .select("id, name, creator, url, image_url")
    .eq("kind", "book");
  if (!force) query = query.is("image_url", null);

  const { data: books, error } = await query;
  if (error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });

  const resolved: { name: string }[] = [];
  const unresolved: { name: string; url: string }[] = [];

  for (const b of books ?? []) {
    let cover: string | null = null;
    try {
      cover = await resolveBookCover(b.url, b.name, b.creator ?? null);
    } catch {
      cover = null;
    }
    if (cover) {
      const { error: upErr } = await ctx.db
        .from("media_picks")
        .update({ image_url: cover, updated_at: new Date().toISOString() })
        .eq("id", b.id);
      if (upErr) {
        unresolved.push({ name: b.name, url: b.url });
      } else {
        resolved.push({ name: b.name });
      }
    } else {
      unresolved.push({ name: b.name, url: b.url });
    }
    // Gentle pace to stay under the iTunes search soft-limit (~20/min). Each
    // click only processes books still missing a cover, so if the tail 429s you
    // can simply click again to resolve the rest — it's idempotent.
    await new Promise((r) => setTimeout(r, 900));
  }

  revalidatePath("/watch-read-listen");
  return NextResponse.json({
    ok: true,
    total: (books ?? []).length,
    resolved,
    unresolved,
  });
}
