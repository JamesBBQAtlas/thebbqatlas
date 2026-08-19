/* Premium owner links (Build Prompt 3c) — shop_url / tickets_url sanitize + the
 * entitlement-key detection. Pure logic; the Featured gate itself is enforced in the
 * route (server-side), tested for shape here.
 * Run: node_modules/.bin/tsx scripts/test-premium-links.mts
 */
import {
  sanitizePremiumLinks,
  hasPremiumLinkKeys,
  PREMIUM_OWNER_LINK_FIELDS,
  OWNER_EDITABLE_FIELDS,
} from "../lib/account/owner-edits";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

console.log("\n[field set — the two premium link-types, incl. tickets]");
{
  ok("shop_url is a premium field", PREMIUM_OWNER_LINK_FIELDS.includes("shop_url"));
  ok("tickets_url (the tickets link-type) is a premium field", PREMIUM_OWNER_LINK_FIELDS.includes("tickets_url"));
  ok("premium fields are NOT in the free whitelist", PREMIUM_OWNER_LINK_FIELDS.every((f) => !(OWNER_EDITABLE_FIELDS as readonly string[]).includes(f)));
}

console.log("\n[sanitizePremiumLinks — https-only, clear-on-empty, ignore junk]");
{
  const good = sanitizePremiumLinks({ shop_url: "shop.example.com", tickets_url: "https://tix.example.com/e/1" });
  ok("bare host gets https:// prefix", good.patch.shop_url === "https://shop.example.com/", good.patch);
  ok("valid https tickets link kept", good.patch.tickets_url === "https://tix.example.com/e/1");
  ok("no rejections for valid input", Object.keys(good.rejected).length === 0);

  const cleared = sanitizePremiumLinks({ shop_url: "", tickets_url: null });
  ok("empty string clears shop_url to null", cleared.patch.shop_url === null);
  ok("null clears tickets_url to null", cleared.patch.tickets_url === null);

  const bad = sanitizePremiumLinks({ shop_url: "http://insecure.example.com", tickets_url: "javascript:alert(1)" });
  ok("http:// rejected (https only)", bad.patch.shop_url === undefined && typeof bad.rejected.shop_url === "string", bad);
  ok("javascript: scheme rejected", bad.patch.tickets_url === undefined && typeof bad.rejected.tickets_url === "string", bad);

  const unknown = sanitizePremiumLinks({ website: "https://x.example.com", evil: "https://y.example.com" });
  ok("unknown/free keys ignored by premium sanitize", Object.keys(unknown.patch).length === 0, unknown.patch);
}

console.log("\n[hasPremiumLinkKeys — detects an attempt to set a premium link]");
{
  ok("true when shop_url present", hasPremiumLinkKeys({ shop_url: "https://a.example.com" }));
  ok("true when tickets_url present (even empty — an explicit clear)", hasPremiumLinkKeys({ tickets_url: "" }));
  ok("false for a pure free-field patch", !hasPremiumLinkKeys({ description: "x", website: "https://a.example.com" }));
  ok("false for an empty patch", !hasPremiumLinkKeys({}));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
