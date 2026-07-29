import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidateVenues } from "@/lib/cache/venues";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Step 3 — the operator picks the flagship for a chain in the "flagship not set"
 * state. This does the RELIABLE, deterministic part only:
 *   - the chosen location becomes the parent (chain_parent_id = null,
 *     flagship_unset = false, rostered);
 *   - every other member re-points to it as a sibling and unlocks;
 *   - the brand's known Instagram/socials are pre-filled onto the siblings as
 *     EDITABLE DEFAULTS (fill-empty — a sibling that runs its own account keeps it).
 * The flagship's own page is then written by the trusted enrich path (the client
 * auto-enriches it), NOT by a guess here — only a confirmed flagship may claim
 * "where it all began".
 */
interface MemberRow {
  id: string;
  status: string | null;
  instagram_url: string | null;
  instagram_handle: string | null;
  x_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
}

const SOCIAL_COLS = [
  "instagram_url",
  "instagram_handle",
  "x_url",
  "facebook_url",
  "tiktok_url",
  "youtube_url",
] as const;

export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required." }, { status: 400 });
  }

  const cols = "id, name, city, status, chain_parent_id, " + SOCIAL_COLS.join(", ");

  const { data: chosen, error: loadErr } = await ctx.db
    .from("restaurants")
    .select(cols)
    .eq("id", restaurantId)
    .single();
  if (loadErr || !chosen) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }
  const chosenRow = chosen as unknown as MemberRow & {
    name: string;
    city: string | null;
    chain_parent_id: string | null;
  };

  // The chain group is rooted at the current temp parent (this row, or its parent
  // if this row is a seed under one). Members = root + all rows under the root.
  const rootId = chosenRow.chain_parent_id ?? chosenRow.id;
  const { data: underRoot } = await ctx.db.from("restaurants").select(cols).eq("chain_parent_id", rootId);
  const { data: rootRow } = await ctx.db.from("restaurants").select(cols).eq("id", rootId).single();
  const members = [
    ...(rootRow ? [rootRow] : []),
    ...(underRoot ?? []),
  ] as unknown as MemberRow[];

  // The brand's known socials — from whichever member already has them (usually
  // the Step-1-enriched started venue). Used as editable defaults for siblings.
  const brandSocials: Record<string, string> = {};
  for (const col of SOCIAL_COLS) {
    for (const m of members) {
      const v = m[col];
      if (v) {
        brandSocials[col] = v;
        break;
      }
    }
  }

  const nowIso = new Date().toISOString();

  // Chosen becomes the CONFIRMED flagship parent.
  await ctx.db
    .from("restaurants")
    .update({
      chain_parent_id: null,
      chain_rostered_at: nowIso,
      flagship_unset: false,
      chain_candidate: false,
    })
    .eq("id", chosenRow.id);

  // Every other member → sibling. Pre-fill brand socials as EDITABLE DEFAULTS
  // (fill-empty only), clear the stale "flagship not set" attention.
  for (const m of members) {
    if (m.id === chosenRow.id) continue;
    const patch: Record<string, unknown> = {
      chain_parent_id: chosenRow.id,
      flagship_unset: false,
      needs_attention: false,
      attention_reason: null,
    };
    for (const col of SOCIAL_COLS) {
      if (!m[col] && brandSocials[col]) patch[col] = brandSocials[col];
    }
    await ctx.db.from("restaurants").update(patch).eq("id", m.id);
  }

  revalidateVenues();
  return NextResponse.json({
    ok: true,
    flagship_id: chosenRow.id,
    flagship_name: chosenRow.name,
    // Tell the client to enrich the flagship via the trusted path — it's now a
    // confirmed flagship, so its copy may reference "where it all began".
    enrich_flagship: true,
    message: `${chosenRow.name}${chosenRow.city ? ` (${chosenRow.city})` : ""} set as the flagship — enriching its page now; the other locations are siblings with the brand socials pre-filled.`,
  });
}
