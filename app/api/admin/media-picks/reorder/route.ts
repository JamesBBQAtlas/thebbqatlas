import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

/**
 * Part B (B3) — persist a section's curated public order. The admin sends the
 * FULL ordered list of ids for one kind; we write sort_order = index (0..n-1) so
 * the DB order matches exactly what the operator arranged. `sort_order` is the
 * order visitors see, so this is the single source of truth for it. Idempotent.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map((x: unknown) => String(x)) : [];
  if (!ids.length) return NextResponse.json({ error: "No order to save." }, { status: 400 });
  // De-dupe defensively — a repeated id would corrupt the sequence.
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Duplicate ids in the order." }, { status: 400 });
  }

  // Write each row's new position. A section is small, so per-row updates are
  // fine and keep us from having to supply every NOT NULL column (as an upsert
  // would). Stop and report on the first failure.
  let updated = 0;
  for (let i = 0; i < ids.length; i++) {
    const { error } = await ctx.db
      .from("media_picks")
      .update({ sort_order: i, updated_at: new Date().toISOString() })
      .eq("id", ids[i]);
    if (error) return NextResponse.json({ error: error.message, updated }, { status: 500 });
    updated++;
  }

  revalidatePath("/watch-read-listen");
  return NextResponse.json({ ok: true, updated });
}
