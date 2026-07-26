import type { SupabaseClient } from "@supabase/supabase-js";
import { uniqueRestaurantSlug } from "./venues";

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
  updated: number; // existing drafts refreshed
  skipped: number; // not a kept venue, or invalid
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
  csvText: string
): Promise<SeedImportResult> {
  const table = parseCsv(csvText).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length < 2) return { total: 0, created: 0, updated: 0, skipped: 0 };

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

  // Which handles already exist? (idempotency key)
  const handles = candidates.map((c) => c.handle).filter((h): h is string => !!h);
  const existing = new Map<string, string>();
  if (handles.length) {
    const { data } = await db
      .from("restaurants")
      .select("id, instagram_handle")
      .in("instagram_handle", handles);
    for (const row of (data ?? []) as { id: string; instagram_handle: string }[]) {
      existing.set(row.instagram_handle, row.id);
    }
  }

  let created = 0;
  let updated = 0;

  for (const c of candidates) {
    const igUrl = c.handle ? `https://www.instagram.com/${c.handle}/` : null;

    if (c.handle && existing.has(c.handle)) {
      // Idempotent refresh — only the seed-owned bits, never enrichment output
      // (don't revert a curated name / description / coords / status).
      const patch: Record<string, string> = {};
      if (c.hero_post_url) patch.hero_post_url = c.hero_post_url;
      if (c.website) patch.website = c.website;
      if (Object.keys(patch).length) {
        await db.from("restaurants").update(patch).eq("id", existing.get(c.handle)!);
      }
      updated++;
      continue;
    }

    // Sequential so uniqueRestaurantSlug sees the prior insert (no batch races).
    const slug = await uniqueRestaurantSlug(db, c.name);
    const { error } = await db.from("restaurants").insert({
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
    });
    if (error) skipped++;
    else created++;
  }

  return { total, created, updated, skipped };
}
