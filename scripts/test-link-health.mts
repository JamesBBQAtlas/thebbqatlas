/**
 * Unit tests for the Part C link-health classifier — the pure decision that a
 * transient failure is NEVER a false "broken". Run: npm run test:link-health
 * (The platform fetchers hit the network and are exercised by the live checker.)
 */
import { classifyHttp, classifyChannelHealth } from "../lib/media/link-health-util";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
  }
}

console.log("\n[classifyHttp — no false 'broken' on transient failures]");
ok("200 → ok", classifyHttp(200) === "ok");
ok("301/302 (followed) → ok", classifyHttp(301) === "ok" && classifyHttp(302) === "ok");
ok("404 → broken", classifyHttp(404) === "broken");
ok("410 gone → broken", classifyHttp(410) === "broken");
ok("500 → unchecked (retry, NOT broken)", classifyHttp(500) === "unchecked");
ok("503 → unchecked (retry, NOT broken)", classifyHttp(503) === "unchecked");
ok("null (timeout/network) → unchecked (retry, NOT broken)", classifyHttp(null) === "unchecked");
ok("429 rate-limited → unchecked (transient, NOT broken)", classifyHttp(429) === "unchecked");

console.log("\n[classifyChannelHealth — the YouTube CHANNEL fix (item 1)]");
// A live handle: the Data API returns 200 with ≥1 matching channel item.
ok("live channel (1 item) → ok", classifyChannelHealth({ kind: "items", count: 1 }).status === "ok");
// A genuinely gone channel: 200 with zero items.
ok("gone channel (0 items) → broken", classifyChannelHealth({ kind: "items", count: 0 }).status === "broken");
ok("gone channel note is 'channel not found'", classifyChannelHealth({ kind: "items", count: 0 }).note === "channel not found");
// The whole point of the fix: an API error must NOT flag a live channel broken.
ok("API 403 (quota) → unchecked, NOT broken", classifyChannelHealth({ kind: "api_error", code: 403 }).status === "unchecked");
ok("API 400 (bad request) → unchecked, NOT broken", classifyChannelHealth({ kind: "api_error", code: 400 }).status === "unchecked");
ok("network error → unchecked, NOT broken", classifyChannelHealth({ kind: "network" }).status === "unchecked");
// No-key page fallback.
ok("page 200 (no 'gone' copy) → ok", classifyChannelHealth({ kind: "page", status: 200, dead: false }).status === "ok");
ok("page 200 with 'terminated' copy → broken", classifyChannelHealth({ kind: "page", status: 200, dead: true }).status === "broken");
ok("page 500 → unchecked (transient)", classifyChannelHealth({ kind: "page", status: 500, dead: false }).status === "unchecked");
// The exact false-flag regression: a live channel that oEmbed-404s must never be broken now.
ok("live channel is never 'broken' via the API path", classifyChannelHealth({ kind: "items", count: 2 }).status !== "broken");

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
