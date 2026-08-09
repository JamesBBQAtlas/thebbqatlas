/* Unit tests for the chain-discovery parsers (Part 1). Pure, no network.
 * Run: node_modules/.bin/tsx scripts/test-chain-discovery.mts
 */
import { parseJsonLd, parseFlatDom, parseLocatorJson, findChildLocatorLinks, looksFlat } from "../lib/admin/chain-discovery/parse";
import { hasStreetAddress, isNotOpen, normalize, streetKey } from "../lib/admin/chain-discovery/normalize";
import { anchorCountry, countryFromHost, countryFromAddress } from "../lib/admin/chain-discovery/country";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

console.log("\n[country anchoring]");
ok("ccTLD .com.au → Australia", countryFromHost("thirdwavebbq.com.au") === "Australia");
ok("ccTLD .co.uk → United Kingdom", countryFromHost("example.co.uk") === "United Kingdom");
ok("generic .com → null", countryFromHost("mission-bbq.com") === null);
ok("US address detected", countryFromAddress("123 Main St, Austin, TX 78701") === "United States");
ok("UK postcode detected", countryFromAddress("10 High St, London SW1X 7HJ") === "United Kingdom");
ok("AU state+postcode detected", countryFromAddress("5 Ascot Vale Rd, Ascot Vale VIC 3032") === "Australia");
ok("generic TLD + AU addresses → Australia", anchorCountry("someglobalbbq.com", ["2 Beach Rd, Applecross WA 6153", "9 Main St, Officer VIC 3809"]) === "Australia");
ok("never defaults to US when unknown", anchorCountry("brand.com", ["No address here"]) === null);

console.log("\n[street-address guard — no invented branches]");
ok("real US street passes", hasStreetAddress({ street: "123 Main Street", city: "Austin" }));
ok("city-only is rejected", hasStreetAddress({ city: "Manhattan" }) === false);
ok("bare name rejected", hasStreetAddress({ location_label: "Downtown" }) === false);
ok("one-line street passes", hasStreetAddress({ address: "45 Oak Ave, Dallas, TX 75201" }));
ok("coming-soon flagged not-open", isNotOpen({ location_label: "Frisco (Coming Soon)" }));

console.log("\n[JSON-LD parse]");
const jsonLdHtml = `<html><head>
<script type="application/ld+json">{"@type":"Restaurant","name":"Brand — Austin","telephone":"512-555-1000","address":{"@type":"PostalAddress","streetAddress":"123 Main St","addressLocality":"Austin","addressRegion":"TX","postalCode":"78701","addressCountry":"US"}}</script>
<script type="application/ld+json">{"@graph":[{"@type":"Restaurant","name":"Brand — Dallas","address":{"streetAddress":"45 Oak Ave","addressLocality":"Dallas","addressRegion":"TX","postalCode":"75201"}}]}</script>
</head><body></body></html>`;
const ld = parseJsonLd(jsonLdHtml, "https://x/loc");
ok("JSON-LD found 2 locations", ld.length === 2, ld);
ok("JSON-LD street parsed", ld[0].street === "123 Main St");
ok("JSON-LD region parsed", ld[0].region === "TX");
ok("JSON-LD @graph nested parsed", ld[1].city === "Dallas");

console.log("\n[flat DOM parse]");
const flatHtml = `<div class="locations">
<div class="location"><h3>Round Rock</h3><address>2011 N Mays St<br>Round Rock, TX 78664<br>(512) 555-2222</address></div>
<div class="location"><h3>Leander</h3><address>651 N US 183<br>Leander, TX 78641</address></div>
</div>`;
const flat = parseFlatDom(flatHtml, "https://x/locations/all");
ok("flat DOM found 2 addresses", flat.length === 2, flat.map(f => f.address));
ok("flat DOM US city/state/zip split", flat[0].city === "Round Rock" && flat[0].region === "TX" && flat[0].postcode === "78664", flat[0]);
ok("flat DOM phone extracted", (flat[0].phone ?? "").includes("512"));
ok("looksFlat true for a flat page", looksFlat(flat));

console.log("\n[generic locator JSON]");
const yextLike = { response: { entities: [
  { name: "Brand Perth", address: { line1: "2 Beach Rd", city: "Applecross", region: "WA", postalCode: "6153", countryCode: "AU" }, mainPhone: "+61 8 5551" },
  { locationName: "Brand Officer", address1: "9 Main St", city: "Officer", state: "VIC", zip: "3809", country: "AU" },
] } };
const jl = parseLocatorJson(yextLike, "https://x/api");
ok("locator JSON found 2 entities", jl.length === 2, jl);
ok("locator JSON nested address.line1", jl[0].street === "2 Beach Rd", jl[0]);
ok("locator JSON flat address1", jl[1].street === "9 Main St", jl[1]);

console.log("\n[hierarchical link detection]");
const indexHtml = `<ul>
<a href="/locations-and-menu/texas">Texas</a>
<a href="/locations-and-menu/maryland">Maryland</a>
<a href="/locations-and-menu/">All</a>
<a href="/about">About</a>
<a href="https://other.com/locations-and-menu/x">External</a>
</ul>`;
const children = findChildLocatorLinks(indexHtml, "https://brand.com/locations-and-menu/");
ok("hierarchical: 2 child region links", children.length === 2, children);
ok("hierarchical: excludes self + about + external", !children.some(c => c.endsWith("/about") || c.includes("other.com")));

console.log("\n[dedupe street key]");
ok("street key folds abbreviations", streetKey("123 Main Street") === streetKey("123 Main St"));
ok("street key strips suite", streetKey("123 Main St, Suite 4") === streetKey("123 Main St"));

const norm = normalize({ street: "123 Main St", city: "Austin", region: "TX", postcode: "78701" }, "United States");
ok("normalise composes address line", norm.address === "123 Main St, Austin, TX 78701", norm.address);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
