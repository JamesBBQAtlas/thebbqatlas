/* Part 4 (perf) — the public LISTING column projection guard. Pure, no DB/next.
 * Locks in the denylist: the heavy admin/enrichment blobs that tipped the anon read
 * past its statement-timeout (17 Aug incident) must never be fetched by a listing, and
 * the essential rendered columns must always be present.
 * Run: node_modules/.bin/tsx scripts/test-directory-perf.mts
 */
import { LIST_COLUMN_ARRAY, LIST_COLUMNS, HEAVY_EXCLUDED_COLUMNS } from "../lib/queries/list-columns";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

console.log("\n[LIST_COLUMNS — heavy admin/enrichment blobs are NEVER fetched by a listing]");
{
  const set = new Set(LIST_COLUMN_ARRAY as readonly string[]);
  for (const heavy of HEAVY_EXCLUDED_COLUMNS) {
    ok(`excludes ${heavy}`, !set.has(heavy));
    ok(`select string does not name ${heavy}`, !new RegExp(`\\b${heavy}\\b`).test(LIST_COLUMNS));
  }
}

console.log("\n[LIST_COLUMNS — every column a public card/map/hub actually renders is present]");
{
  const set = new Set(LIST_COLUMN_ARRAY as readonly string[]);
  const essential = [
    "id", "slug", "name", "description", "style", "lat", "lng", "address", "city",
    "country", "country_code", "hero_image_url", "avg_rating", "review_count",
    "price_level", "category", "permanently_closed", "is_featured", "is_premium",
    "premium_until", "location_label", "hook",
  ];
  for (const col of essential) ok(`includes ${col}`, set.has(col), col);
}

console.log("\n[LIST_COLUMNS — well-formed]");
{
  ok("no duplicate columns", new Set(LIST_COLUMN_ARRAY as readonly string[]).size === LIST_COLUMN_ARRAY.length);
  ok("join string is comma-separated and non-empty", LIST_COLUMNS.includes(", ") && LIST_COLUMNS.split(", ").length === LIST_COLUMN_ARRAY.length);
  ok("no '*' wildcard leaked in", !LIST_COLUMNS.includes("*"));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
