/**
 * Unit tests for the Part 4 chain-handling logic that can be tested without a
 * live crawl: address-from-visible-text extraction, the broadened locator-link
 * synonym match, HQ/shipping classification, and flagship identification.
 *
 * Run: npm run test:chain-part4
 */
import {
  extractAddressesFromText,
  parseVisibleText,
  findLocatorLinks,
  refineCandidates,
} from "../lib/admin/chain-discovery/parse";
import {
  classifyAddressType,
  identifyFlagship,
} from "../lib/admin/chain-discovery/classify";
import { brandToken } from "../lib/admin/chain-seed";

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

console.log("\n[4A — addresses from a homepage's visible text (no locator page)]");
{
  // The exact failure shape: two branch addresses in plain text on the homepage
  // under a quirky heading, plus a shipping suite in the footer.
  const text = `
    Smoky Ridge BBQ — BBQ Near You!
    Come see us at 412 Oak Ridge Rd, Franklin, TN 37064 or our second pit at
    88 Riverside Ave, Chattanooga, TN 37402.
    Mail order & shipping: 1200 Commerce Way, Suite 300, Nashville, TN 37210.
  `;
  const got = extractAddressesFromText(text, "https://smokyridge.test");
  ok("finds both branch addresses in plain text", got.length >= 2);
  ok("captures the Franklin branch", got.some((c) => /Franklin/.test(c.address ?? "")));
  ok("captures the Chattanooga branch", got.some((c) => /Chattanooga/.test(c.address ?? "")));
  ok("each carries a source_url", got.every((c) => c.source_url === "https://smokyridge.test"));
}

console.log("\n[4A — broadened locator-link synonyms]");
{
  const html = `<nav>
    <a href="/menu">Menu</a>
    <a href="/come-see-us">Come See Us</a>
    <a href="/our-pits">Our Pits</a>
    <a href="/about">About</a>
  </nav>`;
  const links = findLocatorLinks(html, "https://x.test");
  ok("matches 'Come See Us'", links.some((u) => u.includes("/come-see-us")));
  ok("matches 'Our Pits'", links.some((u) => u.includes("/our-pits")));
  ok("does not match a plain About link", !links.some((u) => u.endsWith("/about")));
}

console.log("\n[4B — HQ / shipping classification]");
{
  ok("a real street branch is a branch",
    classifyAddressType({ address: "412 Oak Ridge Rd, Franklin, TN 37064" }) === "branch");
  ok("a PO box is hq/shipping",
    classifyAddressType({ address: "PO Box 1234, Nashville, TN 37210" }) === "hq_shipping");
  ok("a mail-order/shipping line is hq/shipping",
    classifyAddressType({ location_label: "Shipping", address: "1200 Commerce Way, Suite 300" }) === "hq_shipping");
  ok("a bare 'Suite' alone is still a branch (not enough on its own)",
    classifyAddressType({ address: "88 Main St, Suite 4, Austin, TX 78704" }) === "branch");
  ok("headquarters is hq/shipping",
    classifyAddressType({ location_label: "Corporate HQ", address: "1 Center Plaza" }) === "hq_shipping");
}

console.log("\n[4D — flagship identification]");
{
  const locs = [
    { location_label: "Chattanooga", street: "88 Riverside Ave", city: "Chattanooga", address: "88 Riverside Ave, Chattanooga, TN" },
    { location_label: "The Original — Est. 1991", street: "412 Oak Ridge Rd", city: "Franklin", address: "412 Oak Ridge Rd, Franklin, TN" },
  ];
  const cue = identifyFlagship(locs);
  ok("picks the location with the 'Original / Est. 1991' cue", cue?.index === 1);
  ok("records a reason", Boolean(cue?.reason));

  // Dossier flagship_location wins over a cue elsewhere.
  const byDossier = identifyFlagship(locs, { flagshipLocation: { city: "Chattanooga" } });
  ok("dossier flagship_location city match wins", byDossier?.index === 0);

  // No signal → null (never guess by position).
  const none = identifyFlagship([
    { location_label: "Downtown", street: "1 A St", city: "Reno", address: "1 A St, Reno, NV" },
    { location_label: "Uptown", street: "2 B St", city: "Reno", address: "2 B St, Reno, NV" },
  ]);
  ok("no signal → null (does not crown by position)", none === null);

  // Earliest founding year on a location.
  const byYear = identifyFlagship([
    { location_label: "West (opened 2015)", street: "5 W St", city: "X", address: "5 W St, X" },
    { location_label: "East (since 2003)", street: "6 E St", city: "Y", address: "6 E St, Y" },
  ]);
  ok("earliest year (2003) wins", byYear?.index === 1);
}

console.log("\n[FAIL-3 fix — clean a scraped address blob]");
{
  const blob =
    "BBQ in Red River Gorge, Thatcher Barbecue Co., 918 Natural Bridge Rd., Slade, KY 40376, (, Hours, Thursday 11am-8pm, Friday-Saturday 11am-9pm, Sunday 11am-8pm, GET DIRECTIONS, LIVE MUSIC IN RRG, Pit House, 918 Natural Bridge Rd.";
  const refined = refineCandidates([{ address: blob, source_url: "u" }]);
  ok("blob → exactly one clean address", refined.length === 1);
  ok("clean address is street/city/state/zip only",
    refined[0].address === "918 Natural Bridge Rd., Slade, KY 40376");
  ok("hours/nav/marketing stripped", !/Hours|DIRECTIONS|LIVE MUSIC/i.test(refined[0].address ?? ""));
}

console.log("\n[FAIL-2 fix — two branches in one block are split out]");
{
  const twoInOne =
    "Visit us! Red River Gorge: 918 Natural Bridge Rd, Slade, KY 40376. Jackson: 1250 Main St, Jackson, KY 41339. Hours vary.";
  const refined = refineCandidates([{ address: twoInOne, source_url: "u" }]);
  ok("recovers BOTH addresses from one block", refined.length === 2);
  ok("includes the Slade branch", refined.some((c) => /Slade/.test(c.address ?? "")));
  ok("includes the Jackson branch (the one that was missed)", refined.some((c) => /Jackson/.test(c.address ?? "")));
}

console.log("\n[FAIL-1 fix — fuzzy brand token for dedupe]");
{
  ok("'Thatcher Barbecue Company' → thatcher", brandToken("Thatcher Barbecue Company") === "thatcher");
  ok("'Thatcher BBQ Company' → thatcher (same token)", brandToken("Thatcher BBQ Company") === "thatcher");
  ok("the two brand variants share a token", brandToken("Thatcher Barbecue Company") === brandToken("Thatcher BBQ Company"));
  ok("keeps the distinctive word past generic ones", brandToken("Franklin Barbecue") === "franklin");
  ok("an all-generic name yields no token (proximity covers it)", brandToken("The Smokehouse BBQ Co") === "");
}

console.log("\n[round-2 — MULTI-LINE address blocks (the Thatcher /location/ regression)]");
{
  // street on one line, city/ST/ZIP on the next — the exact failing shape.
  const twoLine = "THATCHER BARBECUE CO.\n918 Natural Bridge Rd.\nSlade, KY 40376\n(606) 947-8040";
  const got = extractAddressesFromText(twoLine);
  ok("extracts the split street + city/zip as one clean address",
    got.some((c) => c.address === "918 Natural Bridge Rd., Slade, KY 40376"));

  // <br>-separated inside a <p> — cheerio .text() would glue these without the fix.
  const brHtml = `<div class="location"><h2>Thatcher</h2><p>918 Natural Bridge Rd.<br>Slade, KY 40376</p><p>(606) 947-8040</p></div>`;
  ok("<br>-separated block resolves to the clean address",
    parseVisibleText(brHtml).some((c) => c.address === "918 Natural Bridge Rd., Slade, KY 40376"));

  // separate <div> lines.
  const blockHtml = `<div><div>918 Natural Bridge Rd.</div><div>Slade, KY 40376</div></div>`;
  ok("block-element-separated address resolves",
    parseVisibleText(blockHtml).some((c) => c.address === "918 Natural Bridge Rd., Slade, KY 40376"));

  // a lone street line with no following city/zip line must NOT invent an address.
  ok("a lone street line alone yields nothing (no invention)",
    extractAddressesFromText("918 Natural Bridge Rd.\nOpen Thursday–Sunday").length === 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
