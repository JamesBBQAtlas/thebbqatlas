/**
 * Unit tests for the Part C link-health classifier — the pure decision that a
 * transient failure is NEVER a false "broken". Run: npm run test:link-health
 * (The platform fetchers hit the network and are exercised by the live checker.)
 */
import { classifyHttp } from "../lib/media/link-health-util";

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

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
