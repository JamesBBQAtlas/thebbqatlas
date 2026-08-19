/* Claim Venue (Build Prompt 2a) — the domain-match verification hint. Pure.
 * Run: node_modules/.bin/tsx scripts/test-claims.mts
 */
import { domainMatchHint, emailDomain, siteDomain } from "../lib/admin/claims";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

console.log("\n[emailDomain / siteDomain — base-domain extraction]");
{
  ok("email → base domain", emailDomain("jo@bonos.com") === "bonos.com");
  ok("email subdomain → base", emailDomain("jo@mail.bonos.com") === "bonos.com");
  ok("email uppercase + spaces normalised", emailDomain("  JO@Bonos.com ") === "bonos.com");
  ok("not an email → null", emailDomain("nope") === null && emailDomain("") === null && emailDomain(null) === null);

  ok("url with scheme + www + path → base", siteDomain("https://www.bonos.com/menu") === "bonos.com");
  ok("bare host (no scheme) → base", siteDomain("bonos.com") === "bonos.com");
  ok("subdomain site → base", siteDomain("https://order.bonos.com") === "bonos.com");
  ok("garbage → null", siteDomain("::::") === null || siteDomain("") === null);
}

console.log("\n[domainMatchHint — the review-queue signal]");
{
  ok("same base domain → match", domainMatchHint("owner@bonos.com", "https://www.bonos.com") === "match");
  ok("email subdomain still matches the site", domainMatchHint("owner@mail.bonos.com", "bonos.com") === "match");
  ok("gmail vs venue site → mismatch", domainMatchHint("someone@gmail.com", "https://bonos.com") === "mismatch");
  ok("different business domain → mismatch", domainMatchHint("owner@rivals.com", "https://bonos.com") === "mismatch");
  ok("no email → unknown", domainMatchHint(null, "https://bonos.com") === "unknown");
  ok("no website → unknown", domainMatchHint("owner@bonos.com", null) === "unknown");
  ok("neither → unknown", domainMatchHint(null, null) === "unknown");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
