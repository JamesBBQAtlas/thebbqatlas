#!/usr/bin/env node
/**
 * Schema-vs-code column guard (post-cleanup item 2).
 *
 * The recurring, expensive bug class: the app writes a column that no committed
 * migration created, so every write to that table 500s in any environment that
 * doesn't happen to have the out-of-band column. It has bitten twice —
 * `info_note` (missing entirely → every enrich 500'd) and the geo_* columns
 * (populated-but-unmigrated). One guard kills the whole class:
 *
 *   Every top-level column the app writes to a core table (via
 *   .from("t").insert/update/upsert({…})) MUST exist in the committed
 *   migrations. A write to a column the schema doesn't have fails CI — BEFORE it
 *   fails a user.
 *
 * No DB needed: the committed migrations ARE the schema of record. Conservative
 * by design (see scripts/lib/schema-columns.mjs) — never red on a false positive.
 */
import { parseSchema, columnsWritten } from "./lib/schema-columns.mjs";

// Core content tables the app builds dynamic writes for. Others still get their
// columns parsed; only these fail the build on a gap, so we never red-flag a
// table whose write shape we don't model well.
const GUARDED = new Set([
  "restaurants", "media_picks", "submissions", "reviews", "review_photos",
  "brands", "guides", "gear_products", "news", "voice_lines",
]);
const IGNORE_KEYS = new Set(); // explicit seam for known non-columns

const schema = parseSchema();
const written = columnsWritten(GUARDED);
const failures = [];
let checked = 0;

for (const [table, cols] of written) {
  const known = schema.get(table);
  if (!known) continue; // no CREATE TABLE parsed — table-existence is audit:grants' job
  for (const [col, where] of cols) {
    if (IGNORE_KEYS.has(col)) continue;
    checked++;
    if (!known.has(col)) {
      failures.push(`COLUMN: ${table}.${col} is written in code (${where}) but does NOT exist in the committed migrations. Add a migration, or stop writing it.`);
    }
  }
}

console.log(`schema guard: parsed ${schema.size} tables from migrations; checked ${checked} written column(s) across ${written.size} guarded table(s); ${failures.length} missing.`);

if (failures.length) {
  console.error("\n✗ schema-vs-code column guard FAILED:\n");
  for (const f of failures) console.error(`::error::${f}`);
  process.exit(1);
}
console.log("\n✓ schema-vs-code column guard passed — every written column exists in a committed migration.");
process.exit(0);
