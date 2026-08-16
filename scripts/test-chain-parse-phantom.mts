/* Chain-roster hardening — Part 2 (A4 phantom seed) + Part 3 (A5 parse-split).
 * (BUILDPROMPTCHAINROSTERCONSOLIDATED). Pure + network-free.
 * Run: node_modules/.bin/tsx scripts/test-chain-parse-phantom.mts
 */
import { cleanAddress, normStreet } from "../lib/admin/address";
import { extractAddressesFromText, parseVisibleText } from "../lib/admin/chain-discovery/parse";
import { chooseAbsorbTarget, type AbsorbCandidate } from "../lib/admin/chain-seed";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

// ── PART 3 (A5) — address parse robustness ──────────────────────────────────
console.log("\n[A5] un-glue an abbreviation period stuck to the next word");
ok("St.San → St. San", cleanAddress("510 Hull St.San Marcos") === "510 Hull St. San Marcos");
ok("Ave.North → Ave. North", cleanAddress("123 Grand Ave.North Chicago") === "123 Grand Ave. North Chicago");
ok("Rd.East → Rd. East", cleanAddress("7 Mill Rd.East Village") === "7 Mill Rd. East Village");
ok("already-spaced 'St. Louis' unchanged", cleanAddress("2000 Market St. Louis") === "2000 Market St. Louis");
ok("a decimal is never split", cleanAddress("3.5 miles marker") === "3.5 miles marker");

console.log("\n[A5] the Black's twin — glued address parses to the RIGHT street + city");
{
  // The glued source, once de-glued, splits correctly: street '510 Hull St.',
  // city 'San Marcos' (NOT a 'Marcos' fragment).
  const parsed = extractAddressesFromText(cleanAddress("510 Hull St.San Marcos, TX 78666"));
  ok("street is '510 Hull St.', city is 'San Marcos'",
    parsed.length === 1 && parsed[0].city === "San Marcos" && /510 Hull St\.?$/.test((parsed[0].street ?? "").trim()),
    parsed.map((p) => ({ street: p.street, city: p.city })));
  ok("no 'Marcos' fragment as the city", !parsed.some((p) => p.city === "Marcos"));
  // The crawl path de-glues too, so a glued address on a page is parsed cleanly.
  const fromPage = parseVisibleText("<p>Black's BBQ — 510 Hull St.San Marcos, TX 78666</p>");
  ok("crawl parseVisibleText de-glues and finds San Marcos",
    fromPage.some((c) => c.city === "San Marcos"), fromPage.map((c) => ({ street: c.street, city: c.city })));
}

console.log("\n[A5] once parsed, the branch street keys identically to the existing twin");
{
  // The de-glued address parses to street '510 Hull St.'; that street keys the
  // same as the existing twin's '510 Hull St' — so the dedupe collapses them (the
  // pin, now correct, is the geo-proximity backstop for the comma-less raw form).
  const parsed = extractAddressesFromText(cleanAddress("510 Hull St.San Marcos, TX 78666"));
  ok("parsed street key == twin street key",
    normStreet(parsed[0]?.street ?? "") === normStreet("510 Hull St"),
    [normStreet(parsed[0]?.street ?? ""), normStreet("510 Hull St")]);
}

// ── PART 2 (A4) — phantom seed: choose which branch becomes flagship ─────────
console.log("\n[A4] address-less seed → promote the best real branch (N real ⇒ N)");
{
  const mk = (id: string, address: string | null, city: string | null, label: string | null): AbsorbCandidate =>
    ({ id, address, city, location_label: label, lat: null, lng: null });
  // The Bain shape: two real branches under an address-less seed. cityHint is the
  // seed's own city (Memphis) → prefer the Memphis branch as flagship.
  const children = [
    mk("cy", "2126 Central Ave", "Memphis", "Cooper-Young"),
    mk("gt", "9155 Poplar Ave", "Germantown", "Germantown"),
  ];
  const target = chooseAbsorbTarget(children, "Memphis");
  ok("a real branch is chosen (so the seed is absorbed, not left as a phantom)", target !== null);
  ok("prefers the branch in the seed's own city (Memphis → Cooper-Young)", target?.id === "cy", target);

  // No cityHint → still promotes the first branch with a real street.
  ok("no cityHint → first real branch chosen", chooseAbsorbTarget(children, null)?.id === "cy");

  // A genuinely address-less set (no branch has a street) → null, leave for a human.
  const noStreet = [mk("a", "Memphis", "Memphis", "A"), mk("b", null, "Nashville", "B")];
  ok("no branch has a real street → null (never force-promote)", chooseAbsorbTarget(noStreet, "Memphis") === null, noStreet);

  // A branch whose 'address' is just its city is NOT a real street.
  ok("a city-only 'address' doesn't count as a street", chooseAbsorbTarget([mk("x", "Austin", "Austin", "X")], null) === null);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
