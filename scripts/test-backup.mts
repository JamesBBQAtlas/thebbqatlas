/* Weekly DB export (BUILD PROMPT) — the pure serialize/gzip/checksum + path/retention
 * helpers. The live upload + paging need service-role + B2 creds and are exercised by
 * the manual "run now" admin action; this locks the deterministic core.
 * Run: node_modules/.bin/tsx scripts/test-backup.mts
 */
import { gunzipSync } from "node:zlib";
import { rowsToNdjson, countNdjsonLines, gzip, sha256hex } from "../lib/backup/ndjson";
import {
  snapshotFolder, tableKey, manifestKey, foldersFromKeys, foldersToPrune, EXCLUDED_TABLES,
} from "../lib/backup/plan";
import { storageKey } from "../lib/backup/storage";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

console.log("\n[NDJSON — one compact JSON object per line]");
{
  const rows = [{ id: 1, name: "a" }, { id: 2, name: "b\nc" }];
  const nd = rowsToNdjson(rows);
  ok("2 rows → 2 lines + trailing newline", nd === '{"id":1,"name":"a"}\n{"id":2,"name":"b\\nc"}\n');
  ok("countNdjsonLines = 2 (embedded \\n in data not miscounted)", countNdjsonLines(nd) === 2, { got: countNdjsonLines(nd) });
  ok("empty rows → empty string, 0 lines", rowsToNdjson([]) === "" && countNdjsonLines("") === 0);
  ok("round-trips back to the same rows", JSON.stringify(nd.trim().split("\n").map((l) => JSON.parse(l))) === JSON.stringify(rows));
}

console.log("\n[gzip + sha256 — compress, round-trip, deterministic checksum]");
{
  const nd = rowsToNdjson(Array.from({ length: 500 }, (_, i) => ({ id: i, v: `row-${i}` })));
  const gz = gzip(nd);
  ok("gunzip(gzip(x)) === x", gunzipSync(gz).toString("utf8") === nd);
  ok("gzip actually compresses repetitive data", gz.length < Buffer.byteLength(nd));
  ok("sha256 is stable for identical input", sha256hex(gzip(nd)) === sha256hex(gzip(nd)));
  ok("sha256 differs for different input", sha256hex(gzip(nd)) !== sha256hex(gzip(nd + "x")));
}

console.log("\n[paths]");
{
  ok("snapshotFolder = date part of ISO", snapshotFolder("2026-08-20T03:00:00.000Z") === "2026-08-20");
  ok("tableKey", tableKey("bbq-atlas-backups", "2026-08-20", "restaurants") === "bbq-atlas-backups/2026-08-20/restaurants.ndjson.gz");
  ok("manifestKey", manifestKey("bbq-atlas-backups", "2026-08-20") === "bbq-atlas-backups/2026-08-20/manifest.json");
}

console.log("\n[retention — keep newest N, prune the rest]");
{
  const keys = [
    "bbq-atlas-backups/2026-08-20/restaurants.ndjson.gz",
    "bbq-atlas-backups/2026-08-20/manifest.json",
    "bbq-atlas-backups/2026-08-13/restaurants.ndjson.gz",
    "bbq-atlas-backups/2026-08-06/restaurants.ndjson.gz",
    "bbq-atlas-backups/2026-07-30/restaurants.ndjson.gz",
  ];
  const folders = foldersFromKeys("bbq-atlas-backups", keys).sort();
  ok("distinct folders extracted", JSON.stringify(folders) === JSON.stringify(["2026-07-30", "2026-08-06", "2026-08-13", "2026-08-20"]), folders);
  ok("keep 8 → prune nothing (only 4 exist)", foldersToPrune(folders, 8).length === 0);
  ok("keep 2 → prune the 2 oldest", JSON.stringify(foldersToPrune(folders, 2)) === JSON.stringify(["2026-07-30", "2026-08-06"]), foldersToPrune(folders, 2));
  ok("keep 0 → prune all (oldest first)", JSON.stringify(foldersToPrune(folders, 0)) === JSON.stringify(["2026-07-30", "2026-08-06", "2026-08-13", "2026-08-20"]));
}

console.log("\n[excluded tables mirror the DB function]");
{
  for (const t of ["rate_limits", "click_events", "search_impressions", "venue_views", "view_history"]) {
    ok(`${t} is excluded`, EXCLUDED_TABLES.has(t));
  }
  ok("restaurants is NOT excluded", !EXCLUDED_TABLES.has("restaurants"));
}

console.log("\n[storage key — mirror path for uploaded files]");
{
  ok("storageKey mirrors bucket + path", storageKey("bbq-atlas-backups", "media", "abc/def.jpg") === "bbq-atlas-backups/storage/media/abc/def.jpg");
  ok("storage keys are NOT dated (immutable mirror, not per-snapshot)", !/\d{4}-\d{2}-\d{2}/.test(storageKey("bbq-atlas-backups", "media", "x.png")));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
