/**
 * Regression coverage (post-cleanup item 2) — the enrich-path write-safety test.
 *
 * This is the CI-viable form of "POST /api/admin/venues/enrich-draft returns 200,
 * not 500": every column the enrich-draft route writes to `restaurants` must
 * exist in the committed migrations. It's the exact check that would have caught
 * the `info_note` outage (an enrich writing a column no migration created →
 * every enrich 500'd) — scoped tightly to the route that actually went down, so
 * it reads as the enrich smoke it stands in for. A true HTTP-200 e2e needs a live
 * DB; this runs with no DB, in CI, on every push.
 *
 * Run: npm run test:enrich-safety
 */
import { parseSchema, columnsWritten } from "./lib/schema-columns.mjs";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const ENRICH_ROUTE = "app/api/admin/venues/enrich-draft/route.ts";
const schema = parseSchema();
const restaurants = schema.get("restaurants");

console.log("\n[enrich write-safety — every restaurants column the enrich route writes exists]");
ok("schema parsed the restaurants table", Boolean(restaurants && restaurants.size > 20));
ok("info_note is a committed column (the outage catcher)", restaurants!.has("info_note"));

const written = columnsWritten(new Set(["restaurants"]), [ENRICH_ROUTE]);
const cols = written.get("restaurants") ?? new Map<string, string>();
ok("the scan actually found the enrich route's restaurants writes", cols.size > 5);

const missing: string[] = [];
for (const [col] of cols) if (!restaurants!.has(col)) missing.push(col);
for (const [col] of cols) {
  // Surface each checked column as a line so a regression is legible in CI logs.
  if (!restaurants!.has(col)) console.log(`  ✗ enrich writes restaurants.${col} — NOT in any migration`);
}
ok(`all ${cols.size} enrich-written restaurants columns are migration-backed`, missing.length === 0);
if (missing.length) {
  console.error(`\n  enrich would 500 on: ${missing.join(", ")} — add a migration.`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
