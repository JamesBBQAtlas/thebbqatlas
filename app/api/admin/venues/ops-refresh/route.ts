import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED, GROK_MODEL } from "@/lib/ai/grok";
import { researchOps, priceBandToLevel, mapSocials, type VenueLead } from "@/lib/ai/enrich";
import { grokCost, round4 } from "@/lib/ai/cost";
import { logAiUsage } from "@/lib/ai/usage-log";
import { geocodeAddress } from "@/lib/geo/geocode";
import { canonicalCountry } from "@/lib/constants/countries";
import { revalidateVenues } from "@/lib/cache/venues";
import { normalizeHandle } from "@/lib/admin/seed-import";
import { composeAddress, preferFullerAddress, settlementCity } from "@/lib/admin/address";
import { auditField } from "@/lib/admin/content-audit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * "Update details" (OPS-REFRESH-SPEC) — the third, LIGHTER research action next
 * to Enrich and Rewrite. It re-checks ONLY the operational facts that drift
 * (hours, phone, price, socials, whether the venue has closed or moved) via the
 * cheap Grok path, and NEVER touches the copy, name, style or hero image. It
 * skips the Claude writer entirely, so it's cheaper and — crucially — can't
 * churn good copy.
 *
 * Conflict rule (same as re-enrich): where research disagrees with a value the
 * operator already has on file (website / Instagram / phone / hours), we KEEP
 * the operator's value and flag the venue for review — never a silent overwrite.
 * Consequential changes (a permanent closure, a relocation) are applied but also
 * flagged so a human verifies them.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!GROK_ENABLED) {
    return NextResponse.json(
      { error: "AI is off — set XAI_API_KEY to enable research." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required." }, { status: 400 });
  }

  const { data: row, error: loadErr } = await ctx.db
    .from("restaurants")
    .select(
      "id, name, status, website, instagram_url, instagram_handle, phone, hours, price_level, address, city, country, lat, lng, permanently_closed, x_url, facebook_url, tiktok_url, youtube_url, enrichment_cost, needs_attention, attention_reason, pending_changes"
    )
    .eq("id", restaurantId)
    .single();
  if (loadErr || !row) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }
  const priorCost = Number(row.enrichment_cost ?? 0) || 0;

  const rowInstagram =
    row.instagram_url ?? (row.instagram_handle ? `https://www.instagram.com/${row.instagram_handle}/` : undefined);
  const lead: VenueLead = {
    name: row.name ?? undefined,
    instagram: rowInstagram,
    website: row.website ?? undefined,
    address: row.address || undefined,
    city: row.city || undefined,
    country: row.country || undefined,
    phone: row.phone || undefined,
  };

  // Current details on file — the researcher reads these sources FIRST and treats
  // the values as the baseline to re-verify (not blank).
  const knownLines: string[] = [];
  if (row.website) knownLines.push(`- website (READ FIRST): ${row.website}`);
  if (rowInstagram) knownLines.push(`- instagram (READ FIRST): ${rowInstagram}`);
  if (row.phone) knownLines.push(`- phone: ${row.phone}`);
  if (row.hours && typeof row.hours === "object" && Object.keys(row.hours).length) {
    knownLines.push(`- opening hours: ${JSON.stringify(row.hours)}`);
  }
  if (row.price_level) knownLines.push(`- price level: ${"£".repeat(Math.max(1, Math.min(4, Number(row.price_level))))}`);
  if (row.address) knownLines.push(`- address: ${row.address}`);
  if (row.city) knownLines.push(`- city: ${row.city}`);
  const knownFactsBlock = knownLines.length ? knownLines.join("\n") : null;

  let facts;
  let citations: string[];
  let usage;
  let grokModel = GROK_MODEL;
  try {
    const r = await researchOps(lead, { knownFacts: knownFactsBlock });
    facts = r.facts;
    citations = r.citations;
    usage = r.usage;
    grokModel = r.model ?? GROK_MODEL;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Research failed." },
      { status: 502 }
    );
  }

  const cost = round4(grokCost(usage, grokModel));

  // ── Merge (operator-authoritative on conflict) ────────────────────────────
  const normUrl = (u: string | null | undefined) =>
    (u ?? "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "").trim();
  const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
  const sameHours = (a: unknown, b: unknown) => {
    try { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); } catch { return false; }
  };

  const patch: Record<string, unknown> = {};
  const changed: { field: string; old: unknown; new: unknown }[] = [];
  const conflicts: string[] = [];
  const notes: string[] = [];
  const setField = (col: string, auditKey: string, oldVal: unknown, newVal: unknown) => {
    patch[col] = newVal;
    changed.push({ field: auditKey, old: oldVal ?? null, new: newVal ?? null });
  };

  // website — operator-authoritative: fill if empty, else keep + flag on conflict.
  if (facts.website) {
    if (!row.website) setField("website", "website", null, facts.website);
    else if (normUrl(facts.website) !== normUrl(row.website)) conflicts.push("website");
  }
  // instagram — operator-authoritative.
  if (facts.instagram) {
    if (!rowInstagram) {
      setField("instagram_url", "instagram_url", null, facts.instagram);
      const h = normalizeHandle(facts.instagram);
      if (h && !row.instagram_handle) setField("instagram_handle", "instagram", row.instagram_handle, h);
    } else if (normUrl(facts.instagram) !== normUrl(rowInstagram)) {
      conflicts.push("Instagram");
    }
  }
  // phone — operator-authoritative.
  if (facts.phone) {
    if (!row.phone) setField("phone", "phone", null, facts.phone);
    else if (digits(facts.phone) !== digits(row.phone)) conflicts.push("phone");
  }
  // hours — operator-authoritative: fill any DAY the operator left blank; keep
  // the operator's value for a day they set, and flag if research disagreed.
  if (facts.hours && Object.keys(facts.hours).length) {
    const existing = (row.hours && typeof row.hours === "object" ? row.hours : {}) as Record<string, string>;
    const merged: Record<string, string> = { ...existing };
    let filledAny = false;
    let conflicted = false;
    for (const [day, val] of Object.entries(facts.hours)) {
      if (!val) continue;
      const cur = existing[day];
      if (!cur) { merged[day] = val; filledAny = true; }
      else if (cur.trim().toLowerCase() !== String(val).trim().toLowerCase()) conflicted = true;
    }
    if (filledAny && !sameHours(merged, existing)) setField("hours", "hours", existing, merged);
    if (conflicted) conflicts.push("hours");
  }

  // price_level — not operator-protected (low stakes); apply when it changed.
  const price = priceBandToLevel(facts.price_band);
  if (price && price !== Number(row.price_level ?? 0)) {
    setField("price_level", "price_level", row.price_level ?? null, price);
  }

  // socials — fill any we don't already have (never clobber an existing link).
  const socials = mapSocials(facts.other_socials);
  if (socials.x_url && !row.x_url) setField("x_url", "x_url", null, socials.x_url);
  if (socials.facebook_url && !row.facebook_url) setField("facebook_url", "facebook_url", null, socials.facebook_url);
  if (socials.tiktok_url && !row.tiktok_url) setField("tiktok_url", "tiktok_url", null, socials.tiktok_url);
  if (socials.youtube_url && !row.youtube_url) setField("youtube_url", "youtube_url", null, socials.youtube_url);

  // ── The two CONSEQUENTIAL changes are STAGED, not applied live ────────────
  // A wrong phone is trivially reversible; a venue falsely shown permanently
  // CLOSED, or with a wrongly-moved pin, is reputationally costly. So a closure
  // flip and a relocation are held in `pending_changes` for one-click human
  // approval — the public listing does NOT change until the operator confirms.
  const staged: Record<string, unknown> = {};

  // permanently_closed — stage either direction; a NEW closure is the scary one.
  let closureFlag = false;
  if (typeof facts.permanently_closed === "boolean" && facts.permanently_closed !== Boolean(row.permanently_closed)) {
    staged.permanently_closed = facts.permanently_closed;
    closureFlag = true;
    notes.push(
      facts.permanently_closed
        ? "Research indicates this venue may have permanently CLOSED — approve to mark it closed."
        : "Research indicates this venue has RE-OPENED — approve to un-mark closed."
    );
  }

  // moved — only on clear evidence + a real new address. Stage the new location
  // (address/city/coords) for approval; never move a live pin without a human.
  let moveFlag = false;
  if (facts.moved && facts.address) {
    const composed = composeAddress({
      street: facts.address,
      city: facts.city,
      region: facts.region_state,
      postcode: facts.postcode,
    });
    const newAddress = preferFullerAddress(composed, row.address);
    if (newAddress && newAddress !== row.address) {
      staged.address = newAddress;
      moveFlag = true;
      const newCity = facts.city ? settlementCity(facts.city) || facts.city : null;
      if (newCity && newCity !== row.city) staged.city = newCity;
      // Coordinates: use verified dossier coords, else geocode the new address.
      const validCoord = (a: number | null, b: number | null) =>
        typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0);
      if (validCoord(facts.lat, facts.lng)) {
        staged.lat = facts.lat;
        staged.lng = facts.lng;
      } else {
        const geo = await geocodeAddress({ address: facts.address, city: facts.city ?? row.city, country: row.country });
        if (geo && validCoord(geo.lat, geo.lng)) {
          staged.lat = geo.lat;
          staged.lng = geo.lng;
          if (geo.country_code) staged.country_code = geo.country_code;
          if (geo.country) staged.country = canonicalCountry(geo.country);
        }
      }
      notes.push("Research indicates this venue has MOVED — approve to apply the new address & pin.");
    }
  }

  // ── Metadata (always commits) — freshness stamp + this run's cost. ────────
  patch.enriched_at = new Date().toISOString();
  patch.enrichment_cost = round4(priorCost + cost);
  patch.enrichment_cost_breakdown = {
    grok_searches: usage.searches,
    grok_in_tokens: usage.in_tokens,
    grok_out_tokens: usage.out_tokens,
    grok_cost: cost,
    search_cost: round4(usage.searches * 0.005),
    action: "ops_refresh",
  };
  patch.enrichment_model = grokModel;
  if (citations.length || facts.sources.length) {
    patch.enrichment_sources = [...new Set([...citations, ...facts.sources])];
  }

  // Stage the consequential changes for one-click approval — merged onto any
  // existing pending bag so a queued copy proposal isn't lost. The operator
  // approves them via the existing "Review diff → Approve" flow (approve-copy),
  // which applies the whole bag and audits the tracked fields at that point.
  const stagedCount = Object.keys(staged).length;
  if (stagedCount) {
    const existingPending = (row as { pending_changes?: Record<string, unknown> | null }).pending_changes;
    patch.pending_changes = { ...(existingPending && typeof existingPending === "object" ? existingPending : {}), ...staged };
  }

  // Flag for review only when there's something a human should look at — a
  // conflict we refused to overwrite, or a staged closure/move. Otherwise DON'T
  // touch needs_attention (never mask a flag an enrich raised, never falsely clear one).
  const raiseFlag = conflicts.length > 0 || closureFlag || moveFlag;
  if (raiseFlag) {
    patch.needs_attention = true;
    patch.attention_reason = [
      conflicts.length ? `Research disagreed with your ${conflicts.join(", ")} — kept your value; please verify.` : null,
      ...notes,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const { error: updErr } = await ctx.db.from("restaurants").update(patch).eq("id", restaurantId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Ledger: exactly one row for the Grok research call (task ops_refresh).
  await logAiUsage(ctx.db, {
    provider: "xai",
    model: grokModel,
    task: "ops_refresh",
    entity_type: "restaurant",
    entity_id: restaurantId,
    input_tokens: usage.in_tokens,
    output_tokens: usage.out_tokens,
    search_count: usage.searches,
    cost,
    usage_raw: usage,
  });

  // Audit exactly which operational fields changed (old → new), source ai_enrichment.
  for (const c of changed) {
    await auditField(ctx.db, restaurantId, c.field, c.old, c.new, {
      source: "ai_enrichment",
      changedBy: null,
      note: `update details · ${grokModel}`,
    });
  }

  // Operational facts landed live — refresh the public page so a live venue's
  // new hours/phone/socials actually show.
  if (row.status === "approved" && changed.length) revalidateVenues();

  const updatedFields = changed.map((c) => c.field);
  return NextResponse.json({
    ok: true,
    name: row.name,
    updated_fields: updatedFields,
    updated_count: updatedFields.length,
    conflicts,
    closed_changed: closureFlag,
    moved: moveFlag,
    // A closure/move is STAGED (held for one-click approval), not applied live.
    staged: stagedCount > 0,
    has_pending: stagedCount > 0,
    needs_attention: raiseFlag,
    attention_reason: raiseFlag ? patch.attention_reason : null,
    cost,
  });
}
