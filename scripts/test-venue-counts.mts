/* Part 9 — the ONE live-venue count. Pure guard: live = approved AND not permanently
 * closed; the breakdown reconciles to the raw approved figure so admin (529 live · 3
 * closed · 532 approved) can never contradict the homepage (529).
 * Run: node_modules/.bin/tsx scripts/test-venue-counts.mts
 */
import { isLiveVenue, liveVenueBreakdown } from "../lib/venues/live-count";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

console.log("\n[isLiveVenue — approved AND not permanently closed]");
ok("approved + open → live", isLiveVenue({ status: "approved", permanently_closed: false }));
ok("approved + null closed → live", isLiveVenue({ status: "approved" }));
ok("approved + closed → NOT live", !isLiveVenue({ status: "approved", permanently_closed: true }));
ok("pending → NOT live", !isLiveVenue({ status: "pending" }));

console.log("\n[liveVenueBreakdown — 532 approved, 3 closed → 529 live]");
{
  const rows = [
    ...Array.from({ length: 529 }, () => ({ status: "approved", permanently_closed: false })),
    ...Array.from({ length: 3 }, () => ({ status: "approved", permanently_closed: true })),
    ...Array.from({ length: 16 }, () => ({ status: "pending" as const })),
  ];
  const b = liveVenueBreakdown(rows);
  ok("approved = 532 (raw)", b.approved === 532, b.approved);
  ok("closed = 3", b.closed === 3, b.closed);
  ok("live = 529 (matches homepage)", b.live === 529, b.live);
  ok("live + closed = approved (reconciles)", b.live + b.closed === b.approved);
  ok("pending rows are ignored (not approved)", liveVenueBreakdown([{ status: "pending" }]).approved === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
