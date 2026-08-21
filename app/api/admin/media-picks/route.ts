import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const KINDS = new Set(["youtube", "book", "podcast", "video"]);

function clean(body: Record<string, unknown>, requireCore: boolean) {
  const out: Record<string, unknown> = {};
  if (body.kind !== undefined) {
    if (!KINDS.has(String(body.kind))) return { error: "Unknown kind." };
    out.kind = body.kind;
  } else if (requireCore) return { error: "kind is required." };

  const strField = (k: string, max: number, required: boolean) => {
    if (body[k] !== undefined) {
      const v = String(body[k] ?? "").trim();
      out[k] = v ? v.slice(0, max) : null;
    } else if (required && requireCore) {
      return `${k} is required.`;
    }
    return null;
  };
  for (const [k, max, req] of [
    ["name", 200, true],
    ["url", 2048, true],
    ["blurb", 4000, true],
  ] as const) {
    const e = strField(k, max, req);
    if (e) return { error: e };
    if (out[k] === null && req && requireCore) return { error: `${k} is required.` };
  }
  for (const [k, max] of [
    ["creator", 200],
    ["image_url", 2048],
    ["gear_link", 2048],
  ] as const) {
    strField(k, max, false);
  }
  if (body.sort_order !== undefined) {
    const n = parseInt(String(body.sort_order), 10);
    out.sort_order = Number.isFinite(n) ? n : 0;
  }
  if (body.is_published !== undefined) out.is_published = Boolean(body.is_published);
  if (body.links !== undefined) {
    let v: unknown = body.links;
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) v = {};
      else {
        try {
          v = JSON.parse(s);
        } catch {
          return { error: "links must be valid JSON." };
        }
      }
    }
    if (v && typeof v === "object" && !Array.isArray(v)) out.links = v;
    else return { error: "links must be a JSON object." };
  }
  return { patch: out };
}

export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const { patch, error } = clean(body, true);
  if (error || !patch) {
    return NextResponse.json({ error: error ?? "Invalid entry." }, { status: 400 });
  }
  const { data, error: dbErr } = await ctx.db
    .from("media_picks")
    .insert(patch)
    .select("id")
    .single();
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  revalidatePath("/watch-read-listen");
  return NextResponse.json({ ok: true, id: data?.id });
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
  patch.updated_at = new Date().toISOString();
  const { error: dbErr } = await ctx.db.from("media_picks").update(patch).eq("id", id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  revalidatePath("/watch-read-listen");
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { error } = await ctx.db.from("media_picks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  revalidatePath("/watch-read-listen");
  return NextResponse.json({ ok: true });
}
