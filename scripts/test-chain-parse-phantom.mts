/* Chain-roster hardening — Part 2 (A4 phantom seed) + Part 3 (A5 parse-split).
 * (BUILDPROMPTCHAINROSTERCONSOLIDATED). Pure + network-free.
 * Run: node_modules/.bin/tsx scripts/test-chain-parse-phantom.mts
 */
import { cleanAddress, extractCleanAddress, normStreet, normCity } from "../lib/admin/address";
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

// ── A6 (doubled-address scrape) — collapse an exactly-repeated street run ─────
console.log("\n[A6] doubled-address scrape (Southside) collapses to one");
{
  const doubled: [string, string][] = [
    ["1212 Highway 290 1212 Highway 290, Elgin", "1212 Highway 290, Elgin"],
    ["534 Highway 71 534 Highway 71, Bastrop", "534 Highway 71, Bastrop"],
    ["106 Co-Op Blvd 106 Co-Op Blvd, Hutto", "106 Co-Op Blvd, Hutto"],
    ["1420 Shimmering Lane 1420 Shimmering Lane, Leander", "1420 Shimmering Lane, Leander"],
  ];
  for (const [dbl, clean] of doubled) {
    ok(`"${dbl}" → "${clean}"`, cleanAddress(dbl) === clean, cleanAddress(dbl));
    ok(`  keys identically to the clean row`, normStreet(dbl) === normStreet(clean));
  }
  // Whole-address doubling (city repeated in the second copy).
  ok("whole-address double collapses",
    cleanAddress("534 Highway 71, Bastrop 534 Highway 71, Bastrop") === "534 Highway 71, Bastrop",
    cleanAddress("534 Highway 71, Bastrop 534 Highway 71, Bastrop"));
  // Trailing duplicate city segment.
  ok("trailing duplicate city collapses",
    cleanAddress("534 Highway 71, Bastrop, Bastrop") === "534 Highway 71, Bastrop",
    cleanAddress("534 Highway 71, Bastrop, Bastrop"));
}

console.log("\n[A6] over-collapse guard — genuine repeats are NEVER damaged");
{
  ok("'100 100th Ave, City' unchanged", cleanAddress("100 100th Ave, City") === "100 100th Ave, City");
  ok("'Walla Walla' city unchanged", cleanAddress("534 Highway 71, Walla Walla") === "534 Highway 71, Walla Walla");
  ok("'Walla Walla' alone unchanged", cleanAddress("Walla Walla") === "Walla Walla");
  ok("'New York, New York' (city, state) unchanged", cleanAddress("New York, New York") === "New York, New York");
  ok("distinct suites at one street are not merged",
    cleanAddress("100 Main St, Suite 1") === "100 Main St, Suite 1" &&
    cleanAddress("100 Main St, Suite 2") === "100 Main St, Suite 2");
}

// ── A7 (Sugarfire) — phone glued to street number + Saint-prefix city split ───
console.log("\n[A7] phone glued to the street number is stripped");
{
  ok("724-7601 + 3150 → 3150…", cleanAddress("724-76013150 Elm Point Ind. Dr., St. Charles").startsWith("3150 Elm Point"), cleanAddress("724-76013150 Elm Point Ind. Dr., St. Charles"));
  ok("265-1234 + 1541 → 1541…", cleanAddress("265-12341541 Bryan Rd, Dardenne Prairie") === "1541 Bryan Rd, Dardenne Prairie");
  ok("keys identically to the clean twin", normStreet("797-8487605 Washington Ave. St., Louis") === normStreet("605 Washington Ave., St. Louis"));
  // Conservative — a normal address is never stripped of digits.
  ok("normal '3150 Elm Point Dr' untouched", cleanAddress("3150 Elm Point Dr") === "3150 Elm Point Dr");
  ok("hyphenated building '100-200 Main St' untouched", cleanAddress("100-200 Main St") === "100-200 Main St");
  ok("'12-14 Oak Ave' untouched", cleanAddress("12-14 Oak Ave") === "12-14 Oak Ave");
}

console.log("\n[A7] a Saint-prefix city split back into the street is reunited");
{
  ok("'…Ave. St., Louis' → '…Ave., St. Louis'", cleanAddress("605 Washington Ave. St., Louis") === "605 Washington Ave., St. Louis");
  ok("'…Dr. St., Charles' → '…Dr., St. Charles'", cleanAddress("3150 Elm Point Ind. Dr. St., Charles") === "3150 Elm Point Ind. Dr., St. Charles");
  ok("Ste. reunited", cleanAddress("100 Elm Dr. Ste., Genevieve") === "100 Elm Dr., Ste. Genevieve");
  ok("Mt. reunited", cleanAddress("200 Oak Blvd. Mt., Vernon") === "200 Oak Blvd., Mt. Vernon");
  ok("Ft. reunited", cleanAddress("300 Pine Rd. Ft., Worth") === "300 Pine Rd., Ft. Worth");
  // The A5 mirror must NOT regress: a real Street-"St." stays the street.
  ok("Street-'St.' guard: '123 Main St., Springfield' unchanged", cleanAddress("123 Main St., Springfield") === "123 Main St., Springfield");
  ok("Street-'St.' key: street '123 main st', city 'springfield'",
    normStreet("123 Main St., Springfield") === normStreet("123 Main St") && normCity("Springfield") === "springfield");
  ok("already-correct 'Ave., St. Louis' unchanged", cleanAddress("100 Park Ave., St. Louis") === "100 Park Ave., St. Louis");
}

console.log("\n[A7] all-caps folds in the dedupe key (LOUIS == Louis)");
{
  ok("caps street folds", normStreet("9200 OLIVE BLVD., ST. LOUIS") === normStreet("9200 Olive Blvd., St. Louis"));
  ok("caps city folds", normCity("ST. LOUIS") === normCity("St. Louis") && normCity("WENTZVILLE") === normCity("Wentzville"));
  // The full mangled Sugarfire twin (phone + Saint + caps) collapses on text.
  ok("'997-23019200 OLIVE BLVD. ST., LOUIS' keys == clean row",
    normStreet("997-23019200 OLIVE BLVD. ST., LOUIS") === normStreet("9200 Olive Blvd., St. Louis"));
}

// ── A8 (Pit Room / Roegels) — a scraped page-text blob dumped in the address ──
console.log("\n[A8] the real street is extracted from a scraped-text blob");
{
  // The two live twins: surrounding page text (hours / neighbourhood / nav label /
  // business name) glued around the real address. Extract the street, drop the blob.
  ok("'7 days a week IN MONTROSE 1201 Richmond Ave, Houston' → '1201 Richmond Ave, Houston'",
    cleanAddress("7 days a week IN MONTROSE 1201 Richmond Ave, Houston") === "1201 Richmond Ave, Houston",
    cleanAddress("7 days a week IN MONTROSE 1201 Richmond Ave, Houston"));
  ok("'77449KATY FREEWAY WebsiteRoegels Barbecue Co2223 South Voss Road, Houston' → '2223 South Voss Road, Houston'",
    cleanAddress("77449KATY FREEWAY WebsiteRoegels Barbecue Co2223 South Voss Road, Houston") === "2223 South Voss Road, Houston",
    cleanAddress("77449KATY FREEWAY WebsiteRoegels Barbecue Co2223 South Voss Road, Houston"));
  // A leading business-name / nav run before the number is dropped too.
  ok("leading nav segments before the number are dropped",
    cleanAddress("Website, Menu, 400 Main St, Austin") === "400 Main St, Austin",
    cleanAddress("Website, Menu, 400 Main St, Austin"));
}

console.log("\n[A8] each blob keys + geocodes to the flagship (dedupes to one)");
{
  ok("Montrose blob keys == '1201 Richmond Ave' flagship",
    normStreet("7 days a week IN MONTROSE 1201 Richmond Ave, Houston") === normStreet("1201 Richmond Ave, Houston, TX 77006"),
    [normStreet("7 days a week IN MONTROSE 1201 Richmond Ave, Houston"), normStreet("1201 Richmond Ave, Houston, TX 77006")]);
  ok("Voss blob keys == '2223 South Voss Road' flagship",
    normStreet("77449KATY FREEWAY WebsiteRoegels Barbecue Co2223 South Voss Road, Houston") === normStreet("2223 South Voss Road, Houston, TX 77057"),
    [normStreet("77449KATY FREEWAY WebsiteRoegels Barbecue Co2223 South Voss Road, Houston"), normStreet("2223 South Voss Road, Houston, TX 77057")]);
}

console.log("\n[A8] guard — proper-name camelCase + clean/range addresses are NEVER damaged");
{
  ok("'6001 McKinley Parkway, Blasdell' unchanged", cleanAddress("6001 McKinley Parkway, Blasdell") === "6001 McKinley Parkway, Blasdell", cleanAddress("6001 McKinley Parkway, Blasdell"));
  ok("'500 MacArthur Blvd, Oakland' unchanged", cleanAddress("500 MacArthur Blvd, Oakland") === "500 MacArthur Blvd, Oakland");
  ok("'10 WestQuay Rd, Southampton' unchanged", cleanAddress("10 WestQuay Rd, Southampton") === "10 WestQuay Rd, Southampton");
  ok("'220 LaFayette St, New York' unchanged", cleanAddress("220 LaFayette St, New York") === "220 LaFayette St, New York");
  ok("bare 'MacArthur Blvd' (no number) unchanged", cleanAddress("MacArthur Blvd") === "MacArthur Blvd");
  ok("'DeSoto' token alone unchanged", cleanAddress("DeSoto") === "DeSoto");
  // Clean, hyphenated-range and unit-lead addresses must survive the blob step.
  ok("clean '1201 Richmond Ave, Houston' unchanged", cleanAddress("1201 Richmond Ave, Houston") === "1201 Richmond Ave, Houston");
  ok("range '100-200 Main St' unchanged", cleanAddress("100-200 Main St") === "100-200 Main St");
  ok("range '12-14 Oak Ave' unchanged", cleanAddress("12-14 Oak Ave") === "12-14 Oak Ave");
  ok("unit lead 'Suite 100, 200 Main St' preserved", cleanAddress("Suite 100, 200 Main St") === "Suite 100, 200 Main St", cleanAddress("Suite 100, 200 Main St"));
}

console.log("\n[A8] extract report — a blob with NO clean street is flagged, not guessed");
{
  // Acceptance 4: no extractable NNN Street → wasBlob but not extracted, address
  // left exactly as-is (never a guessed street). Seed flags needs_attention.
  const noStreet = extractCleanAddress("7 days a week IN MONTROSE Website Menu Order Online");
  ok("blob w/ nav prose but no street → wasBlob, NOT extracted", noStreet.wasBlob === true && noStreet.extracted === false, noStreet);
  ok("un-extractable blob is returned unchanged (no guess)", noStreet.address === "7 days a week IN MONTROSE Website Menu Order Online");
  // A confident extraction reports extracted=true.
  const good = extractCleanAddress("77449KATY FREEWAY WebsiteRoegels Barbecue Co2223 South Voss Road, Houston");
  ok("a confident extraction reports extracted=true", good.extracted === true && good.address === "2223 South Voss Road, Houston");
  // A plain thin address is NOT a blob (no false flag).
  const thin = extractCleanAddress("Houston");
  ok("plain thin address 'Houston' is not a blob", thin.wasBlob === false && thin.extracted === false && thin.address === "Houston");
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
