/* Owner accuracy edits (Build Prompt 2b) — the field whitelist + URL safety +
 * patch sanitisation. Pure.
 * Run: node_modules/.bin/tsx scripts/test-owner-edits.mts
 */
import { sanitizeOwnerPatch, safeHttpsUrl, OWNER_EDITABLE_FIELDS } from "../lib/account/owner-edits";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

console.log("\n[safeHttpsUrl — https only, no javascript:/data:/http:]");
{
  ok("bare host → https://…", safeHttpsUrl("bonos.com") === "https://bonos.com/");
  ok("keeps a valid https url", safeHttpsUrl("https://bonos.com/menu") === "https://bonos.com/menu");
  ok("upgrades a scheme-less url to https", safeHttpsUrl("www.bonos.com")?.startsWith("https://") === true);
  ok("REJECTS http:// (returns null)", safeHttpsUrl("http://bonos.com") === null);
  ok("REJECTS javascript: (xss)", safeHttpsUrl("javascript:alert(1)") === null);
  ok("REJECTS data: url", safeHttpsUrl("data:text/html,<script>") === null);
  ok("empty → null", safeHttpsUrl("") === null && safeHttpsUrl("   ") === null && safeHttpsUrl(null) === null);
}

console.log("\n[sanitizeOwnerPatch — whitelist + validate + normalise]");
{
  const { patch, rejected } = sanitizeOwnerPatch({
    description: "  Great smoked brisket.  ",
    phone: "  (555) 123-4567 ",
    website: "bonos.com",
    instagram_url: "http://insecure.com",   // rejected (not https)
    x_url: "",                               // explicit clear → null
    role: "admin",                           // NOT whitelisted → ignored
    owner_id: "someone-else",                // NOT whitelisted → ignored
    hours: { mon: " 11-9 ", fun: "x" },      // only valid days kept
  });
  ok("description trimmed + kept", patch.description === "Great smoked brisket.");
  ok("phone trimmed + kept", patch.phone === "(555) 123-4567");
  ok("bare website upgraded to https", patch.website === "https://bonos.com/");
  ok("http:// social REJECTED with a reason", !("instagram_url" in patch) && typeof rejected.instagram_url === "string");
  ok("empty social clears to null", patch.x_url === null);
  ok("non-whitelisted 'role' ignored (no privilege escalation)", !("role" in patch));
  ok("non-whitelisted 'owner_id' ignored", !("owner_id" in patch));
  ok("hours keeps valid days only, trims", JSON.stringify(patch.hours) === JSON.stringify({ mon: "11-9" }));
  ok("a field not supplied is absent (partial patch)", !("youtube_url" in patch));
}

console.log("\n[OWNER_EDITABLE_FIELDS — the FREE accuracy set, no premium/identity fields]");
{
  const set = new Set<string>(OWNER_EDITABLE_FIELDS);
  ok("includes the free accuracy fields", ["description", "phone", "website", "hours", "instagram_url", "x_url", "facebook_url", "tiktok_url", "youtube_url"].every((f) => set.has(f)));
  ok("does NOT include premium/hero/identity fields", !set.has("hero_image_url") && !set.has("name") && !set.has("status") && !set.has("owner_id") && !set.has("is_featured"));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
