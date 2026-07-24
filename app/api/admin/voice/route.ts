import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import type { VoiceSlot } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const SLOTS: VoiceSlot[] = [
  "homepage_subline",
  "footer",
  "empty_state",
  "loading",
  "not_found",
  "newsletter_confirm",
  "success_toast",
];

/** Admin voice-bank mutations. Guarded by requireAdmin() (admin role + aal2). */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { action?: string; id?: string; line?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const db = ctx.db;
  const now = new Date().toISOString();

  if (body.action === "retire" || body.action === "restore") {
    if (!body.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
    const { error } = await db
      .from("voice_lines")
      .update({ is_active: body.action === "restore", updated_at: now })
      .eq("id", body.id);
    if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
    const { error } = await db.from("voice_lines").delete().eq("id", body.id);
    if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "save") {
    const l = body.line ?? {};
    const text = String(l.text ?? "").trim();
    const slot = l.slot as VoiceSlot;
    if (!text || !SLOTS.includes(slot)) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const row = {
      slot,
      text,
      tag: l.tag ? String(l.tag).trim() : null,
      is_active: l.is_active === undefined ? true : Boolean(l.is_active),
      sort_order: Number.isFinite(Number(l.sort_order)) ? Number(l.sort_order) : 0,
      updated_at: now,
    };
    const { error } = l.id
      ? await db.from("voice_lines").update(row).eq("id", String(l.id))
      : await db.from("voice_lines").insert(row);
    if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
