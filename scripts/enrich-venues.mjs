#!/usr/bin/env node
/**
 * Batch venue enrichment — sends Grok hunting for the thin venues in the
 * catalogue and writes a review report. Grok finds; you polish.
 *
 * Usage:
 *   node scripts/enrich-venues.mjs                # dry run → scripts/enrich-report.json
 *   node scripts/enrich-venues.mjs --limit 20     # cap how many venues
 *   node scripts/enrich-venues.mjs --apply        # also write high-confidence fields back
 *   node scripts/enrich-venues.mjs --apply --min-confidence 0.8
 *
 * Requires env: XAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Reads .env.local automatically if present.
 *
 * SAFETY: --apply only ever fills EMPTY columns on a venue and only above the
 * confidence threshold. It never overwrites data you already have.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// --- tiny .env.local loader (no dotenv dependency) ---
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_BASE = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";
const XAI_MODEL = process.env.XAI_MODEL ?? "grok-4";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const APPLY = flag("--apply");
const LIMIT = parseInt(opt("--limit", "25"), 10);
const MIN_CONF = parseFloat(opt("--min-confidence", "0.75"));

if (!XAI_API_KEY) {
  console.error("✗ XAI_API_KEY is not set — cannot run enrichment.");
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ Supabase URL / service-role key missing.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SYSTEM = `You are a meticulous research assistant for The BBQ Atlas. Given fragments about a real barbecue venue, HUNT the live web to verify and complete the record. Never invent phone numbers, addresses or hours — if you can't verify a field, return null. Respond ONLY with a JSON object: {description, website, phone, address, city, country, price_level, hours, permanently_closed, confidence, reviewer_notes}. "hours" is keyed mon..sun or null. "price_level" 1-4 or null. "description" is 2-4 warm, factual sentences. "confidence" is 0-1.`;

async function enrich(v) {
  const known = ["name", "website", "address", "city", "country", "phone"]
    .filter((k) => v[k])
    .map((k) => `- ${k}: ${v[k]}`)
    .join("\n");

  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: XAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      search_parameters: { mode: "on", return_citations: true, max_search_results: 10 },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Known about this venue:\n${known}\n\nReturn the JSON object.`,
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Grok ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "{}";
  const citations = json?.citations ?? [];
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    data = m ? JSON.parse(m[0]) : {};
  }
  return { data, citations };
}

const THIN_COLS = ["description", "website", "phone", "hours"];

async function main() {
  console.log(
    `▶ Batch enrichment — model ${XAI_MODEL}, limit ${LIMIT}, ${
      APPLY ? `APPLY (≥${MIN_CONF})` : "DRY RUN"
    }\n`
  );

  const { data: rows, error } = await db
    .from("restaurants")
    .select("id, name, slug, description, website, phone, address, city, country, hours, price_level")
    .limit(500);
  if (error) throw error;

  const thin = rows
    .filter((r) => THIN_COLS.some((c) => !r[c]))
    .slice(0, LIMIT);

  console.log(`Found ${thin.length} thin venue(s) to enrich.\n`);
  const report = [];

  for (const v of thin) {
    process.stdout.write(`· ${v.name} … `);
    try {
      const { data, citations } = await enrich(v);
      const conf = typeof data.confidence === "number" ? data.confidence : 0;

      const entry = {
        id: v.id,
        slug: v.slug,
        name: v.name,
        confidence: conf,
        suggested: data,
        citations,
        applied: [],
      };

      if (APPLY && conf >= MIN_CONF) {
        const update = {};
        // Only fill columns that are currently empty.
        for (const c of ["description", "website", "phone", "hours", "price_level", "address", "city", "country"]) {
          if (!v[c] && data[c] != null && data[c] !== "") update[c] = data[c];
        }
        if (Object.keys(update).length) {
          const { error: uerr } = await db.from("restaurants").update(update).eq("id", v.id);
          if (uerr) throw uerr;
          entry.applied = Object.keys(update);
        }
      }

      report.push(entry);
      console.log(
        `${Math.round(conf * 100)}%${entry.applied.length ? ` → applied ${entry.applied.join(", ")}` : ""}`
      );
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      report.push({ id: v.id, name: v.name, error: err.message });
    }
  }

  const out = join(process.cwd(), "scripts", "enrich-report.json");
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\n✓ Wrote ${report.length} result(s) to ${out}`);
  if (!APPLY) console.log("  (dry run — re-run with --apply to write high-confidence fields.)");
}

main().catch((e) => {
  console.error("\n✗ Fatal:", e.message);
  process.exit(1);
});
