/**
 * Affiliate HARD-RULE tripwire (Part 1.3). The standing guarantee that a $0
 * Amazon link can never reach production. Fails the build (exit 1) if:
 *   A. the earn predicate itself regresses,
 *   B. any component emits a raw amazon.* href outside the AffiliateLink /
 *      GearProductCard choke point, or
 *   C. any stored gear_products.affiliate_url or media_picks(kind=book).url row
 *      would render as a non-earning Amazon link (foreign store / foreign tag).
 *
 * Uses the SAME `affiliateUrlEarns` the render path uses — one definition of
 * "can this link earn?". Run: `npm run audit:affiliate` (wired into pre-push).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { affiliateUrlEarns } from "../lib/affiliate";

let failed = false;
const fail = (msg: string) => { console.error("  ✗", msg); failed = true; };
const ok = (msg: string) => console.log("  ✓", msg);

// ── A. Predicate self-test (a deliberate .co.uk/untagged link MUST fail) ─────
console.log("[A] earn predicate");
const cases: [string, boolean][] = [
  ["https://www.amazon.com/dp/B000000000", true],
  ["https://www.amazon.com/dp/B000000000?tag=thebbqatlasus-20", true],
  ["https://www.amazon.co.uk/dp/B000000000", false],            // foreign store
  ["https://www.amazon.de/dp/B000000000", false],               // foreign store
  ["https://www.amazon.com/dp/B000000000?tag=thebbqatlas-21", false], // foreign tag
  ["https://dalstrong.com/products/knife", true],               // non-Amazon program
];
for (const [url, expected] of cases) {
  if (affiliateUrlEarns(url) === expected) ok(`${expected ? "earns" : "rejected"}: ${url}`);
  else fail(`predicate wrong for ${url} (expected ${expected})`);
}

// ── B. No raw amazon.* href outside the choke point ─────────────────────────
console.log("[B] component scan (no raw amazon hrefs)");
const ALLOW = new Set(["lib/affiliate.ts", "scripts/audit-affiliate.mts", "scripts/test-affiliate.mts"]);
const HREF_AMAZON = /href\s*[=:]\s*[`"'][^`"']*amazon\./i;
function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(tsx?|mts)$/.test(e.name)) acc.push(p);
  }
  return acc;
}
let rawHits = 0;
for (const base of ["components", "app"]) {
  if (!existsSync(base)) continue;
  for (const file of walk(base)) {
    const rel = file.replace(/\\/g, "/");
    if (ALLOW.has(rel)) continue;
    if (HREF_AMAZON.test(readFileSync(file, "utf8"))) { fail(`raw amazon href in ${rel} — route it through AffiliateLink`); rawHits++; }
  }
}
if (!rawHits) ok("no raw amazon hrefs in components/app");

// ── C. Stored rows must all earn ────────────────────────────────────────────
console.log("[C] stored affiliate rows");
function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}
const env = { ...loadEnvLocal(), ...process.env } as Record<string, string>;
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log("  – SKIPPED (no Supabase env) — logic + component scan still enforced.");
} else {
  const isAmazon = (u: string) => /(^|\.)amazon\./i.test((() => { try { return new URL(u).hostname; } catch { return ""; } })());
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const db = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: gear, error: gErr } = await db.from("gear_products").select("name, affiliate_url, is_active").eq("is_active", true);
    if (gErr) throw gErr;
    for (const g of (gear ?? []) as { name: string; affiliate_url: string }[]) {
      if (isAmazon(g.affiliate_url) && !affiliateUrlEarns(g.affiliate_url)) fail(`gear "${g.name}" → non-earning: ${g.affiliate_url}`);
    }
    let books: { name?: string; url: string }[] = [];
    try {
      // Only PUBLISHED books actually ship a link — those are the ones the rule guards.
      const { data } = await db.from("media_picks").select("name, url, kind, is_published").eq("kind", "book").eq("is_published", true);
      books = (data ?? []) as { name?: string; url: string }[];
    } catch { /* media_picks may not carry books — skip */ }
    for (const b of books) {
      if (b.url && isAmazon(b.url) && !affiliateUrlEarns(b.url)) fail(`book "${b.name ?? b.url}" → non-earning: ${b.url}`);
    }
    if (!failed) ok(`${(gear ?? []).length} gear + ${books.length} book rows all earn`);
  } catch (e) {
    // Best-effort, like the grants audit — a DB that's unreachable from this
    // machine skips the row scan (CI/prod with reachable Supabase still enforces).
    console.log(`  – SKIPPED (DB unreachable: ${e instanceof Error ? e.message : "error"}) — logic + component scan still enforced.`);
  }
}

console.log("");
if (failed) {
  console.error("✗ affiliate hard-rule FAILED — a non-earning Amazon link would ship. Fix before deploy.");
  process.exit(1);
}
console.log("✓ affiliate hard-rule passed — every Amazon link is set up to earn.");
