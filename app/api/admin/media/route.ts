import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

/** PATCH — approve or reject a pending media item. */
export async function PATCH(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const mediaId = String(body.mediaId ?? "");
  const status =
    body.status === "approved" ? "approved" : body.status === "rejected" ? "rejected" : null;
  if (!mediaId || !status) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // On reject, also remove the underlying file from storage.
  if (status === "rejected") {
    const { data: row } = await ctx.db
      .from("media")
      .select("storage_path")
      .eq("id", mediaId)
      .single();
    if (row?.storage_path) {
      await ctx.db.storage.from("media").remove([row.storage_path]);
    }
  }

  const { error } = await ctx.db.from("media").update({ status }).eq("id", mediaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status });
}
