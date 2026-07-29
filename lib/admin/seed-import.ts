import type { SupabaseClient } from "@supabase/supabase-js";
import { uniqueRestaurantSlug } from "./venues";
import { loadExistingVenues } from "@/lib/venues/dedupe-server";
import { findDuplicates, normName, type VenueLike } from "@/lib/venues/dedupe";
import { normCity } from "@/lib/admin/address";

/**
 * Bulk venue seed import. Parses the follow-list seed sheet, keeps only real
 * venues the owner marked to keep, and creates DRAFT (status='pending') venue
 * records — invisible to the public site until enriched + approved. Idempotent:
 * keyed on the normalised instagram_handle, so re-importing updates the same
 * draft (refreshes hero post + website) instead of duplicating it.
 *
 * Deliberately does NOT geocode here (that would mean one throttled Nominatim
 * call per row). Drafts land at 0,0 and get real coordinates when the enrichment
 * pipeline researches their address; the Publish guard blocks un-geocoded rows.
 */

export interface SeedImportResult {
  total: number; // data rows seen
  created: number; // new drafts inserted
  updated: number; // existing drafts refreshed (idempotent handle match)
  skipped: number; // not a kept venue, or invalid
  // Global dedupe guard (§):
  matchedExisting: number; // high-confidence match to an existing venue — NOT created
  flaggedUncertain: number; // created as a seed, flagged "possible duplicate of X"
  internalDupsCollapsed: number; // duplicate rows within the file itself
  report: string; // one-line human summary
}

/** RFC-4180-ish CSV parser: handles quoted fields, commas, and escaped quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const s = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** "@Handle", "instagram.com/handle/", "Handle " → "handle" (or null). */
export function normalizeHandle(raw: string): string | null {
  let h = (raw || "").trim();
  if (!h) return null;
  const m = h.match(/instagram\.com\/([^/?#]+)/i);
  if (m) h = m[1];
  h = h
    .replace(/^@/, "")
    .replace(/\/+$/, "")
    .trim()
    .toLowerCase();
  if (!h || h.includes(" ") || h === "explore") return null;
  return h;
}

const isYes = (v: string) => ["y", "yes", "true", "1"].includes(v.trim().toLowerCase());
const isInstagramPost = (v: string) => /instagram\.com\/(p|reel)\//i.test(v);

export async function importSeedRows(
  db: SupabaseClient,
  csvText: string,
  opts: { dryRun?: boolean } = {}
): Promise<SeedImportResult> {
  const dryRun = Boolean(opts.dryRun);
  const table = parseCsv(csvText).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length < 2) {
    return {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      matchedExisting: 0,
      flaggedUncertain: 0,
      internalDupsCollapsed: 0,
      report: "No data rows found.",
    };
  }

  const header = table[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iHandle = idx("instagram_handle");
  const iDisplay = idx("display_name");
  const iType = idx("type");
  const iKeep = idx("keep");
  const iName = idx("venue_name");
  const iCity = idx("city");
  const iCountry = idx("country");
  const iWebsite = idx("website");
  const iHero = idx("hero_post_url");
  const cell = (row: string[], i: number) =>
    i >= 0 && i < row.length ? row[i].trim() : "";

  type Candidate = {
    handle: string | null;
    name: string;
    city: string;
    country: string;
    website: string | null;
    hero_post_url: string | null;
  };

  const total = table.length - 1;
  const candidates: Candidate[] = [];
  let skipped = 0;

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    // Only real venues the owner explicitly marked to keep.
    if (cell(row, iType).toLowerCase() !== "venue" || !isYes(cell(row, iKeep))) {
      skipped++;
      continue;
    }
    const handle = normalizeHandle(cell(row, iHandle));
    const name = cell(row, iName) || cell(row, iDisplay) || handle || "";
    if (!name) {
      skipped++;
      continue;
    }
    const heroRaw = cell(row, iHero);
    candidates.push({
      handle,
      name,
      city: cell(row, iCity),
      country: cell(row, iCountry),
      website: cell(row, iWebsite) || null,
      hero_post_url: isInstagramPost(heroRaw) ? heroRaw : null,
    });
  }

  // ---- dedupe WITHIN the file first (the 623 may contain internal dups) ----
  const seenKeys = new Set<string>();
  const unique: Candidate[] = [];
  let internalDupsCollapsed = 0;
  for (const c of candidates) {
    // A row is an internal dup if it shares a handle, or a normalized name AND
    // city, with an earlier kept row.
    const key = c.handle ? `h:${c.handle}` : `n:${normName(c.name)}|${normCity(c.city)}`;
    if (seenKeys.has(key)) {
      internalDupsCollapsed++;
      continue;
    }
    seenKeys.add(key);
    unique.push(c);
  }

  // Which handles already exist? (idempotency key — refresh, not duplicate.)
  const handles = unique.map((c) => c.handle).filter((h): h is string => !!h);
  const existingByHandle = new Map<string, string>();
  if (handles.length) {
    const { data } = await db
      .from("restaurants")
      .select("id, instagram_handle")
      .in("instagram_handle", handles);
    for (const row of (data ?? []) as { id: string; instagram_handle: string }[]) {
      existingByHandle.set(row.instagram_handle, row.id);
    }
  }

  // Every existing venue, for the global dedupe match. Seeds have no
  // address/geo, so this degrades to name + city (per the shared module).
  const existingVenues = await loadExistingVenues(db);

  let created = 0;
  let updated = 0;
  let matchedExisting = 0;
  let flaggedUncertain = 0;

  for (const c of unique) {
    const igUrl = c.handle ? `https://www.instagram.com/${c.handle}/` : null;

    // Idempotent refresh on handle — never a duplicate.
    if (c.handle && existingByHandle.has(c.handle)) {
      const patch: Record<string, string> = {};
      if (c.hero_post_url) patch.hero_post_url = c.hero_post_url;
      if (c.website) patch.website = c.website;
      if (!dryRun && Object.keys(patch).length) {
        await db.from("restaurants").update(patch).eq("id", existingByHandle.get(c.handle)!);
      }
      updated++;
      continue;
    }

    // Match this candidate against ALL existing venues (§ global dedupe guard).
    const matches = findDuplicates(
      { name: c.name, city: c.city, address: null, lat: 0, lng: 0 },
      existingVenues
    );
    // A genuine new branch of an existing chain is NOT a duplicate — it has a
    // different city, so it never matches on name+city here.
    if (matches.some((m) => m.confidence === "high")) {
      // High-confidence match → do NOT create a duplicate. Recorded in report.
      matchedExisting++;
      continue;
    }
    const uncertain = matches[0]; // best medium match, if any

    // Sequential so uniqueRestaurantSlug sees the prior insert (no batch races).
    const slug = await uniqueRestaurantSlug(db, c.name);
    const insertRow: Record<string, unknown> = {
      slug,
      name: c.name,
      description: `${c.name} — barbecue${c.city ? ` in ${c.city}` : ""}.`,
      style: "other",
      lat: 0,
      lng: 0,
      address: "",
      city: c.city,
      country: c.country,
      website: c.website,
      price_level: 2,
      hero_image_url: "",
      status: "pending",
      category: "restaurant",
      instagram_handle: c.handle,
      instagram_url: igUrl,
      hero_post_url: c.hero_post_url,
    };
    if (uncertain) {
      // Uncertain → create the seed but FLAG it for review (surfaces in the
      // hub's Needs-attention filter with the reason + the linked venue).
      insertRow.possible_duplicate_of = uncertain.id;
      insertRow.duplicate_reason = uncertain.reason;
      insertRow.needs_attention = true;
      insertRow.attention_reason = `Possible duplicate of ${uncertain.name}${
        uncertain.city ? `, ${uncertain.city}` : ""
      } — ${uncertain.reason}. Review before publishing.`;
    }

    if (dryRun) {
      // Preview only — count what WOULD happen and register a synthetic row so
      // later rows still dedupe against this would-be creation.
      created++;
      if (uncertain) flaggedUncertain++;
      existingVenues.push({ id: `dry-${created}`, name: c.name, city: c.city, address: null, lat: 0, lng: 0 });
      continue;
    }

    const { data: inserted, error } = await db
      .from("restaurants")
      .insert(insertRow)
      .select("id, name, slug, address, city, lat, lng, chain_parent_id")
      .single();
    if (error) {
      skipped++;
    } else {
      created++;
      if (uncertain) flaggedUncertain++;
      // Register the new seed so later rows in THIS import dedupe against it too.
      if (inserted) existingVenues.push(inserted as VenueLike);
    }
  }

  const report =
    `${dryRun ? "[DRY RUN — nothing written] " : ""}${total} rows → ${created} new seed${created === 1 ? "" : "s"} · ` +
    `${matchedExisting} matched existing (skipped) · ` +
    `${flaggedUncertain} flagged uncertain · ` +
    `${updated} handle-refreshed · ` +
    `${internalDupsCollapsed} internal dup${internalDupsCollapsed === 1 ? "" : "s"} collapsed · ` +
    `${skipped} skipped`;

  return {
    total,
    created,
    updated,
    skipped,
    matchedExisting,
    flaggedUncertain,
    internalDupsCollapsed,
    report,
  };
}
