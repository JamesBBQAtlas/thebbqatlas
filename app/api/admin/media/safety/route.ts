import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { screenPhoto, sweepPhotoSafety, type SafetyTable } from "@/lib/admin/photo-safety";
import { PHOTO_SAFETY_ENABLED } from "@/lib/ai/photo-safety";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Admin on-demand photo safety screen (Prompt 4). Either screen ONE photo
 * (`{ mediaId, table? }`) before deciding on it, or run a bounded sweep of the
 * least-recently-screened photos (`{ sweep: true, limit? }`). Admin-only,
 * service-role. Screening only writes safety_* signals — it never changes the
 * moderation status (a human still approves/rejects).
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!PHOTO_SAFETY_ENABLED) {
    return NextResponse.json(
      { error: "Photo safety is off — set XAI_API_KEY to enable it." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));

  if (body.sweep === true) {
    const limit = typeof body.limit === "number" ? body.limit : undefined;
    const summary = await sweepPhotoSafety(ctx.db, { limit });
    return NextResponse.json({ ok: true, summary });
  }

  const mediaId = String(body.mediaId ?? "");
  const table: SafetyTable = body.table === "review_photos" ? "review_photos" : "media";
  if (!mediaId) return NextResponse.json({ error: "Missing mediaId" }, { status: 400 });

  const { data: row } = await ctx.db.from(table).select("id, url").eq("id", mediaId).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await screenPhoto(ctx.db, table, row as { id: string; url: string | null });
  return NextResponse.json({ ok: true, result });
}
