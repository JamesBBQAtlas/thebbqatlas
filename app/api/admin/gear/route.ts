import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import type { GearCategory } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const CATEGORIES: GearCategory[] = [
  "thermometers",
  "smokers_grills",
  "fuel_wood",
  "tools",
  "cleaning",
];

/**
 * Admin gear-catalogue mutations. Guarded by requireAdmin() (admin role + aal2).
 * Actions: save (create/update), retire, restore, delete.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    action?: string;
    id?: string;
    product?: Record<string, unknown>;
  };
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
      .from("gear_products")
      .update({ is_active: body.action === "restore", updated_at: now })
      .eq("id", body.id);
    if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
    const { error } = await db.from("gear_products").delete().eq("id", body.id);
    if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "save") {
    const p = body.product ?? {};
    const name = String(p.name ?? "").trim();
    const category = p.category as GearCategory;
    const affiliate_url = String(p.affiliate_url ?? "").trim();
    if (!name || !CATEGORIES.includes(category) || !affiliate_url) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const row = {
      name,
      brand: p.brand ? String(p.brand).trim() : null,
      category,
      description: p.description ? String(p.description).trim() : null,
      image_url: p.image_url ? String(p.image_url).trim() : null,
      affiliate_url,
      partner: p.partner ? String(p.partner).trim().toLowerCase() : null,
      price_note: p.price_note ? String(p.price_note).trim() : null,
      style_tags: Array.isArray(p.style_tags) ? p.style_tags.map(String) : [],
      is_featured: Boolean(p.is_featured),
      is_active: p.is_active === undefined ? true : Boolean(p.is_active),
      sort_order: Number.isFinite(Number(p.sort_order)) ? Number(p.sort_order) : 0,
      updated_at: now,
    };
    const { error } = p.id
      ? await db.from("gear_products").update(row).eq("id", String(p.id))
      : await db.from("gear_products").insert(row);
    if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
