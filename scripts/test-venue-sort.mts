/* Unit tests for the admin venue-listing sort. Run: npm run test:sort */
import { compareVenues, type SortableVenue, type SortKey, type SortDir } from "../lib/admin/venue-sort";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra?: unknown) => c ? (pass++, console.log("  ✓", n)) : (fail++, console.log("  ✗", n, extra ?? ""));

const V = (o: Partial<SortableVenue> & { id: string }): SortableVenue => ({
  name: o.id, status: "approved", country: "United States", hasRealPhoto: false, hasIG: false, postsCount: 0, enriched_at: null, ...o,
});
const order = (vs: SortableVenue[], k: SortKey, d: SortDir) => [...vs].sort((a, b) => compareVenues(a, b, k, d)).map((v) => v.id);

console.log("\n[enriched]");
const e = [
  V({ id: "old", enriched_at: "2026-01-01T00:00:00Z" }),
  V({ id: "new", enriched_at: "2026-08-01T00:00:00Z" }),
  V({ id: "mid", enriched_at: "2026-05-01T00:00:00Z" }),
  V({ id: "never", enriched_at: null }),
];
ok("desc = newest first, null last", JSON.stringify(order(e, "enriched", "desc")) === JSON.stringify(["new", "mid", "old", "never"]), order(e, "enriched", "desc"));
ok("asc = oldest first, null STILL last", JSON.stringify(order(e, "enriched", "asc")) === JSON.stringify(["old", "mid", "new", "never"]), order(e, "enriched", "asc"));

console.log("\n[name — strip leading punctuation]");
const n = [V({ id: "smoke", name: '"Smoke"' }), V({ id: "apex", name: "Apex BBQ" }), V({ id: "wilson", name: "'Wilson's" }), V({ id: "zed", name: "Zed" })];
ok("asc ignores leading quotes: Apex, Smoke, Wilson, Zed", JSON.stringify(order(n, "name", "asc")) === JSON.stringify(["apex", "smoke", "wilson", "zed"]), order(n, "name", "asc"));

console.log("\n[country — blank last both directions]");
const c = [V({ id: "au", country: "Australia" }), V({ id: "blank", country: "" }), V({ id: "us", country: "United States" }), V({ id: "nullc", country: null })];
ok("asc: Australia, United States, then blanks", order(c, "country", "asc").slice(0, 2).join(",") === "au,us" && new Set(order(c, "country", "asc").slice(2)).size === 2, order(c, "country", "asc"));
ok("desc: blanks STILL last", new Set(order(c, "country", "desc").slice(2)).size === 2 && order(c, "country", "desc")[0] === "us", order(c, "country", "desc"));

console.log("\n[ig — presence then count]");
const ig = [V({ id: "none", hasIG: false, postsCount: 0 }), V({ id: "lo", hasIG: true, postsCount: 3 }), V({ id: "hi", hasIG: true, postsCount: 40 })];
ok("desc: IG venues first, higher count first", JSON.stringify(order(ig, "ig", "desc")) === JSON.stringify(["hi", "lo", "none"]), order(ig, "ig", "desc"));
ok("asc: no-IG first", order(ig, "ig", "asc")[0] === "none", order(ig, "ig", "asc"));

console.log("\n[status — grouped]");
const s = [V({ id: "r", status: "rejected" }), V({ id: "p", status: "pending" }), V({ id: "a", status: "approved" }), V({ id: "k", status: "parked" })];
ok("asc: pending, approved, parked, rejected", JSON.stringify(order(s, "status", "asc")) === JSON.stringify(["p", "a", "k", "r"]), order(s, "status", "asc"));

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
