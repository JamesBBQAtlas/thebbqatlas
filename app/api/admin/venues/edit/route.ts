import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { geocodeStructured } from "@/lib/geo/geocode";
import { canonicalCountry } from "@/lib/constants/countries";
import { settlementCity } from "@/lib/admin/address";
import { revalidateVenues } from "@/lib/cache/venues";
import { auditFromPatch, auditField } from "@/lib/admin/content-audit";
import { BBQ_STYLES } from "@/lib/constants/styles";
import { looksLikeSeedStub } from "@/lib/admin/seed-copy";
import { ITEM_CATEGORIES } from "@/lib/ai/enrich";
import { parseStoredFaq } from "@/lib/seo/venue-faq";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const str = (v: unknown): string | null =>
  typeof v === "string" ? v.trim() : null;
const validCoord = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0);

/**
 * Full manual venue editor (Fix 3). Lets the operator hand-edit EVERY field —
 * the house-voice copy (hook + description), name, address/pin, city, country,
 * socials, phone, hours, price band, BBQ style, offerings, and the featured /
 * permanently-closed flags — and saves it live. Editing the copy marks the venue
 * `manual_copy` so a later AI enrich/rewrite must confirm before overwriting the
 * operator's words (their edits are sacred). Everything revalidates so the venue
 * page, map and directory reflect the change on the next load.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId required." }, { status: 400 });

  const { data: row, error: loadErr } = await ctx.db
    .from("restaurants")
    .select(
      "id, name, description, hook, style, category, manual_category, address, city, country, lat, lng, instagram_handle, website, hero_image_url, is_featured, permanently_closed, status, chain_parent_id, flagship_unset, needs_attention, attention_reason"
    )
    .eq("id", restaurantId)
    .single();
  if (loadErr || !row) return NextResponse.json({ error: "Venue not found." }, { status: 404 });

  const patch: Record<string, unknown> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  // ---- Copy (hook + description) — deliberate human edit → manual_copy -------
  let touchedCopy = false;
  if (has("hook")) { patch.hook = str(body.hook) ?? ""; touchedCopy = true; }
  if (has("description")) { patch.description = str(body.description) ?? ""; touchedCopy = true; }
  // Part 2 (copy-deadlock): only PROTECT genuinely hand-written copy. Saving the
  // editor without changing the auto seed stub (still "<name> — barbecue in
  // <city>.") must NOT flip manual_copy on — that's what deadlocked enrichment.
  const savedDescription = has("description")
    ? (patch.description as string)
    : (row.description as string | null);
  if (touchedCopy && !looksLikeSeedStub(savedDescription)) {
    patch.manual_copy = true;
    patch.manual_copy_at = new Date().toISOString();
  } else if (touchedCopy) {
    // Editing/keeping a stub → explicitly leave it unprotected so it can enrich.
    patch.manual_copy = false;
  }

  // ---- Plain text fields ----------------------------------------------------
  if (has("name")) { const v = str(body.name); if (v) patch.name = v; }
  if (has("location_label")) patch.location_label = str(body.location_label) || null;
  if (has("phone")) patch.phone = str(body.phone) || null;
  if (has("website")) patch.website = str(body.website) || null;
  if (has("instagram_url")) patch.instagram_url = str(body.instagram_url) || null;
  if (has("instagram_handle")) {
    const h = str(body.instagram_handle);
    patch.instagram_handle = h ? h.replace(/^@/, "").replace(/\/+$/, "").toLowerCase() : null;
  }
  if (has("x_url")) patch.x_url = str(body.x_url) || null;
  if (has("facebook_url")) patch.facebook_url = str(body.facebook_url) || null;
  if (has("tiktok_url")) patch.tiktok_url = str(body.tiktok_url) || null;
  if (has("youtube_url")) patch.youtube_url = str(body.youtube_url) || null;

  // ---- Enumerations / numerics ----------------------------------------------
  if (has("style")) {
    const s = str(body.style);
    if (s && (BBQ_STYLES as readonly string[]).includes(s)) patch.style = s;
  }
  // Part G — operator-edited FAQ. A hand-edited FAQ is protected (manual_faq) so a
  // later enrich can't overwrite it. Stored entries are marked source 'admin'.
  if (has("faq")) {
    const entries = parseStoredFaq(body.faq).map((e) => ({ q: e.q, a: e.a, source: "admin" as const }));
    patch.faq = entries;
    patch.manual_faq = true;
    patch.manual_faq_at = new Date().toISOString();
  }
  // Part 5 — the operator setting the ITEM TYPE by hand is a confirmed value:
  // protect it (manual_category) so a later AI re-enrich never reclassifies it.
  if (has("category")) {
    const c = str(body.category);
    if (c && (ITEM_CATEGORIES as readonly string[]).includes(c) && c !== row.category) {
      patch.category = c;
      patch.manual_category = true;
      patch.manual_category_at = new Date().toISOString();
    }
  }
  if (has("price_level")) {
    const n = Number(body.price_level);
    if (Number.isFinite(n) && n >= 1 && n <= 4) patch.price_level = Math.round(n);
  }
  if (has("offerings")) {
    patch.offerings = Array.isArray(body.offerings)
      ? (body.offerings as unknown[]).map((o) => str(o)).filter((o): o is string => Boolean(o))
      : [];
  }
  if (has("hours")) {
    // Accept an object keyed mon..sun (or null to clear).
    patch.hours = body.hours && typeof body.hours === "object" ? body.hours : null;
  }

  // ---- Flags ----------------------------------------------------------------
  let closing = false;
  if (has("permanently_closed")) {
    patch.permanently_closed = Boolean(body.permanently_closed);
    closing = Boolean(body.permanently_closed);
  }
  if (has("is_featured")) patch.is_featured = Boolean(body.is_featured);
  // A permanently-closed venue can never be Featured (Fix 7).
  if (closing) patch.is_featured = false;

  // ---- Location (address / city / country / pin) ----------------------------
  const editingLocation = has("address") || has("city") || has("country") || has("lat") || has("lng") || has("regeocode");
  if (editingLocation) {
    const address = has("address") ? str(body.address) ?? "" : (row.address as string);
    const rawCity = has("city") ? str(body.city) ?? "" : (row.city as string);
    const country = canonicalCountry(has("country") && str(body.country) ? String(body.country) : (row.country as string));
    patch.address = address;
    patch.city = settlementCity(rawCity) || rawCity;
    patch.country = country;

    // Postcode entered folded into the address string ("…, London, NW1 0TH") —
    // pull the trailing token so geocodeStructured can anchor on it.
    const trailingPostcode = address.split(",").pop()?.trim() || null;
    const hasManualPin = validCoord(body.lat, body.lng);
    let locatedOk = false;
    if (hasManualPin && !body.regeocode) {
      // Fix 4 — a hand-placed pin is sacred. Store it and LOCK it so no later
      // enrich / update-details / ops-refresh re-geocode can move it. Mirrors
      // manual_copy. The operator clears the lock via "re-geocode from address".
      patch.lat = body.lat;
      patch.lng = body.lng;
      patch.geo_locked = true;
      patch.geo_source = "manual";
      patch.geo_precision = "manual";
      patch.geo_confidence = 1;
      locatedOk = true;
    } else {
      // Re-geocode from the address — structured, country-constrained, postcode-
      // anchored (geocode-fix). An explicit re-geocode is a deliberate operator
      // action, so it CLEARS any manual lock and lets a fresh pin land. Never
      // silently save (0,0): a low-confidence miss falls back to a manual pin or
      // flags rather than guessing.
      const geo = await geocodeStructured({
        address,
        city: rawCity,
        postcode: trailingPostcode,
        country,
        name: row.name as string,
      });
      if (geo.result && validCoord(geo.result.lat, geo.result.lng)) {
        patch.lat = geo.result.lat;
        patch.lng = geo.result.lng;
        if (geo.result.country_code) patch.country_code = geo.result.country_code;
        patch.geo_locked = false; // deliberate re-geocode releases the lock
        patch.geo_precision = geo.precision;
        patch.geo_confidence = geo.confidence;
        patch.geo_source = geo.source;
        locatedOk = true;
        // A postcode-area pin is placed but not exact — flag it for verification.
        if (geo.status === "approximate") {
          patch.needs_attention = true;
          patch.attention_reason = geo.reason ?? "geocode: postcode-area pin — verify the exact spot";
        }
      } else if (hasManualPin) {
        // Re-geocode missed but the operator also supplied a pin — take & lock it.
        patch.lat = body.lat;
        patch.lng = body.lng;
        patch.geo_locked = true;
        patch.geo_source = "manual";
        patch.geo_precision = "manual";
        patch.geo_confidence = 1;
        locatedOk = true;
      } else if (!validCoord(row.lat, row.lng)) {
        // Couldn't locate and no pin to fall back on — flag rather than 0,0.
        patch.needs_attention = true;
        patch.attention_reason = geo.reason ?? "Couldn't locate — check address / set pin manually";
      }
    }
    // Fix 3 — a corrected address / hand-placed pin that resolved clears a
    // lingering "couldn't locate" flag automatically (don't touch other flags).
    // But do NOT clear a flag we just set this save (e.g. an approximate pin that
    // itself needs verifying).
    const justFlagged = patch.needs_attention === true;
    const locateReason = /couldn.?t locate|set pin manually|place this venue|location facts/i;
    if (!justFlagged && locatedOk && row.needs_attention && locateReason.test(String(row.attention_reason ?? ""))) {
      patch.needs_attention = false;
      patch.attention_reason = null;
    }
  }

  // A chain BRANCH must never sit on "other" while its flagship has a definite
  // style — if the operator set this branch to "other", adopt the flagship's.
  if (row.chain_parent_id && patch.style === "other") {
    const { data: fp } = await ctx.db.from("restaurants").select("style").eq("id", row.chain_parent_id).single();
    const fs = (fp?.style as string) ?? null;
    if (fs && fs !== "other") patch.style = fs;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }

  // Part 5 — record who/when last meaningfully edited this venue (admin actor).
  patch.updated_at = new Date().toISOString();
  patch.updated_by = ctx.userId;
  patch.updated_by_actor = "admin";

  const { error: updErr } = await ctx.db.from("restaurants").update(patch).eq("id", restaurantId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Editorial audit trail — one row per changed tracked field (manual edit).
  await auditFromPatch(ctx.db, restaurantId, row as Record<string, unknown>, patch, {
    source: "manual_edit",
    changedBy: ctx.userId,
    note: touchedCopy ? "manual copy edit" : "manual field edit",
  });

  // Flagship style change → propagate the new definite style to any branch still
  // on the "other" default, so no branch is left contradicting the flagship.
  // Branches that already carry a different definite style are left as-is.
  let styledBranches = 0;
  if (!row.chain_parent_id && typeof patch.style === "string" && patch.style !== "other" && patch.style !== row.style) {
    const { data: branches } = await ctx.db
      .from("restaurants")
      .select("id, style")
      .eq("chain_parent_id", restaurantId);
    for (const b of (branches ?? []) as { id: string; style: string | null }[]) {
      if (b.style === "other" || !b.style) {
        await ctx.db.from("restaurants").update({ style: patch.style }).eq("id", b.id);
        await auditField(ctx.db, b.id, "style", b.style ?? null, patch.style, {
          source: "roster",
          changedBy: ctx.userId,
          note: "inherited flagship style (flagship style changed)",
        });
        styledBranches++;
      }
    }
  }

  revalidateVenues();
  return NextResponse.json({
    ok: true,
    lat: patch.lat ?? row.lat,
    lng: patch.lng ?? row.lng,
    manual_copy: Boolean(patch.manual_copy),
    styled_branches: styledBranches,
    saved: Object.keys(patch),
  });
}
