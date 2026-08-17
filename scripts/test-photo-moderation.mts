/* Part 3 — photo moderation routing. Pure guard: a community `media` venue upload and
 * a `review_photos` attachment resolve to the right table, and an untrusted/absent
 * source defaults to review (back-compat). The bug was media photos never routing to
 * `media`, so this locks the mapping.
 * Run: node_modules/.bin/tsx scripts/test-photo-moderation.mts
 */
import { normalizePhotoSource, photoModerationTable } from "../lib/admin/photo-moderation";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name); }
}

console.log("\n[normalizePhotoSource — trust only an explicit 'media']");
ok("'media' → media", normalizePhotoSource("media") === "media");
ok("'review' → review", normalizePhotoSource("review") === "review");
ok("undefined → review (back-compat)", normalizePhotoSource(undefined) === "review");
ok("garbage → review (safe default)", normalizePhotoSource("nonsense") === "review");
ok("null → review", normalizePhotoSource(null) === "review");

console.log("\n[photoModerationTable — the community venue upload writes back to media]");
ok("media source → media table", photoModerationTable("media") === "media");
ok("review source → review_photos table", photoModerationTable("review") === "review_photos");
ok("a media venue upload never lands in review_photos", photoModerationTable(normalizePhotoSource("media")) === "media");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
