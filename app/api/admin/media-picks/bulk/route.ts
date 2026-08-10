import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Op = "publish" | "unpublish" | "delete";

/**
 * Part B (B5) — bulk publish / unpublish / delete for a set of library items.
 * Returns a per-op result summary { succeeded, failed:[{id,error}] } so the UI
 * can report "N succeeded / N failed". Delete is a hard delete; the client keeps
 * the removed rows in memory and offers an "Undo" that re-creates them (there's
 * no soft-delete column on media_picks), so this endpoint just removes.
 * Re-check-links is handled by the existing check-links endpoint (ids), and
 * move-to-position by the reorder endpoint — this route is the state/removal ops.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const op = String(body.op ?? "") as Op;
  const ids = Array.isArray(body.ids) ? body.ids.map((x: unknown) => String(x)).filter(Boolean) : [];
  if (!["publish", "unpublish", "delete"].includes(op)) {
    return NextResponse.json({ error: "Unknown bulk op." }, { status: 400 });
  }
  if (!ids.length) return NextResponse.json({ error: "No rows selected." }, { status: 400 });

  const failed: { id: string; error: string }[] = [];
  let succeeded = 0;

  if (op === "delete") {
    for (const id of ids) {
      const { error } = await ctx.db.from("media_picks").delete().eq("id", id);
      if (error) failed.push({ id, error: error.message });
      else succeeded++;
    }
  } else {
    const is_published = op === "publish";
    for (const id of ids) {
      const { error } = await ctx.db
        .from("media_picks")
        .update({ is_published, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) failed.push({ id, error: error.message });
      else succeeded++;
    }
  }

  revalidatePath("/watch-read-listen");
  return NextResponse.json({ ok: true, op, succeeded, failed });
}
