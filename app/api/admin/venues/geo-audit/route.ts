import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidateVenues } from "@/lib/cache/venues";
import {
  postcodeAnchor,
  extractUKPostcode,
  GEOCODE_INCOMPLETE_REASON,
  GEOCODE_LOWCONF_REASON,
} from "@/lib/geo/geocode";
import { resolveCountryCode } from "@/lib/constants/countries";
import { haversineKm } from "@/lib/utils/geo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Fix 5 — pin-sanity audit (one-off + repeatable). Sweeps every venue and finds
 * the pins a human should look at:
 *   • MISSING     — no pin (null or the 0,0 "null island" sentinel);
 *   • INCOMPLETE  — no street address to place it on (city-only / blank);
 *   • LOW-CONF    — placed at low confidence, or only to a centroid-level
 *     precision (place / region / country / postcode) — never validated;
 *   • FAR         — the stored pin sits implausibly far from its own postcode
 *     (UK postcodes checked live via postcodes.io; this is the Rack City class).
 *
 * `geo_locked` rows are TRUSTED (a human placed them) and never flagged.
 *
 * Two modes:
 *   • dry-run (default) — reports the counts + a sample, changes NOTHING;
 *   • ?apply=1 / {apply:true} — sets needs_attention + a specific reason on the
 *     flagged rows (never clobbering a non-geo attention reason already present).
 *
 * The count is ALWAYS reported in full — the live postcode-distance check is the
 * only bounded part, and the response reports exactly how many were checked vs
 * skipped so nothing is silently capped.
 */

const FAR_KM = 20; // a pin this far from its own postcode is almost certainly wrong
const MAX_POSTCODE_CHECKS = 400; // bound live postcodes.io calls per run (reported)

const GEO_REASONS = new Set<string>([
  GEOCODE_INCOMPLETE_REASON,
  GEOCODE_LOWCONF_REASON,
  "geocode: town-level only — verify pin",
  "geocode: postcode-area pin — verify the exact spot",
  "pin far from its postcode — verify",
  "no pin — place it on the map",
  "Couldn't locate — check address / set pin manually",
]);

type Verdict = "ok" | "missing" | "incomplete" | "low_confidence" | "far";

interface Row {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  status: string | null;
  lat: number | null;
  lng: number | null;
  geo_locked: boolean | null;
  geo_precision: string | null;
  geo_confidence: number | null;
  needs_attention: boolean | null;
  attention_reason: string | null;
}

const CENTROID_PRECISION = new Set(["place", "locality", "region", "state", "province", "country", "postcode", "postal_code", "none"]);

function hasPin(r: Row): boolean {
  return (
    typeof r.lat === "number" && typeof r.lng === "number" &&
    Number.isFinite(r.lat) && Number.isFinite(r.lng) && !(r.lat === 0 && r.lng === 0)
  );
}

function reasonFor(v: Verdict): string {
  switch (v) {
    case "missing": return "no pin — place it on the map";
    case "incomplete": return GEOCODE_INCOMPLETE_REASON;
    case "low_confidence": return GEOCODE_LOWCONF_REASON;
    case "far": return "pin far from its postcode — verify";
    default: return "";
  }
}

export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const apply = url.searchParams.get("apply") === "1" || body.apply === true;

  // Page through ALL venues (no silent cap on the sweep itself).
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await ctx.db
      .from("restaurants")
      .select("id, name, address, city, country, status, lat, lng, geo_locked, geo_precision, geo_confidence, needs_attention, attention_reason")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const batch = (data ?? []) as unknown as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const counts = { total: rows.length, locked: 0, ok: 0, missing: 0, incomplete: 0, low_confidence: 0, far: 0 };
  let postcodeChecksRun = 0;
  let postcodeChecksSkipped = 0;
  const flagged: { id: string; name: string | null; verdict: Verdict; reason: string; km?: number }[] = [];

  for (const r of rows) {
    // A hand-locked pin is trusted — never audited.
    if (r.geo_locked) { counts.locked++; continue; }

    const street = (r.address ?? "").trim();
    const pinned = hasPin(r);
    let verdict: Verdict = "ok";
    let km: number | undefined;

    if (!pinned) {
      verdict = "missing";
    } else if (!street) {
      // A pin with no street address behind it can't be trusted / re-derived.
      verdict = "incomplete";
    } else {
      // Precision / confidence gate on the stored quality.
      const prec = String(r.geo_precision ?? "");
      const conf = typeof r.geo_confidence === "number" ? r.geo_confidence : null;
      const looksCentroid = prec !== "" && CENTROID_PRECISION.has(prec);
      const lowConf = conf !== null && conf < 0.5;
      if (looksCentroid || lowConf) verdict = "low_confidence";

      // Live distance check for UK postcodes (the Rack City class). Only when we
      // still think the pin is OK — a cheap way to catch a validated-looking pin
      // that's actually in the wrong town.
      if (verdict === "ok") {
        const pc = extractUKPostcode(r.address);
        if (pc) {
          if (postcodeChecksRun < MAX_POSTCODE_CHECKS) {
            postcodeChecksRun++;
            const iso = resolveCountryCode(null, r.country ?? null);
            const anchor = await postcodeAnchor(iso ?? "GB", pc);
            if (anchor) {
              const d = haversineKm(r.lat as number, r.lng as number, anchor.lat, anchor.lng);
              if (d > FAR_KM) { verdict = "far"; km = Math.round(d); }
            }
          } else {
            postcodeChecksSkipped++;
          }
        }
      }
    }

    if (verdict === "ok") { counts.ok++; continue; }
    counts[verdict]++;
    flagged.push({ id: r.id, name: r.name, verdict, reason: reasonFor(verdict), ...(km != null ? { km } : {}) });
  }

  // Apply mode — set the flag + reason on each flagged row. We only overwrite the
  // attention_reason when the row is unflagged OR already carries a geo reason, so
  // a hand-written non-geo attention note is never trampled.
  let applied = 0;
  if (apply && flagged.length) {
    for (const f of flagged) {
      const row = rows.find((r) => r.id === f.id)!;
      const existing = String(row.attention_reason ?? "");
      const canWriteReason = !row.needs_attention || existing === "" || GEO_REASONS.has(existing);
      const patch: Record<string, unknown> = { needs_attention: true };
      if (canWriteReason) patch.attention_reason = f.reason;
      const { error } = await ctx.db.from("restaurants").update(patch).eq("id", f.id);
      if (!error) applied++;
    }
    revalidateVenues();
  }

  return NextResponse.json({
    ok: true,
    mode: apply ? "apply" : "dry-run",
    counts: {
      ...counts,
      flagged: flagged.length,
      applied,
    },
    postcode_checks: {
      run: postcodeChecksRun,
      skipped: postcodeChecksSkipped,
      cap: MAX_POSTCODE_CHECKS,
      note: postcodeChecksSkipped > 0
        ? `${postcodeChecksSkipped} UK-postcode distance checks were skipped past the ${MAX_POSTCODE_CHECKS}/run cap — re-run to continue (distance check only; every venue was still classified).`
        : null,
    },
    // A capped sample so the response stays a sane size; the COUNTS above are
    // complete and uncapped. Bump `limit` in the body to widen the sample.
    sample: flagged.slice(0, Math.max(0, Number(body.limit) || 100)),
  });
}
