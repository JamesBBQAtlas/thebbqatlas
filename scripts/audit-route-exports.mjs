#!/usr/bin/env node
/**
 * Route-export guardrail.
 *
 * A Next.js App Router `route.ts` / `route.tsx` may only export HTTP method
 * handlers and a fixed allowlist of route-segment config. Exporting anything
 * else (a helper, a constant — e.g. so a test can import it) is NOT a TypeScript
 * error, so `tsc --noEmit` stays green, but it FAILS the production `next build`
 * with: "<name> is not a valid Route export field". That gap took two failed
 * prod deployments to surface once — this guard closes it in CI/pre-push.
 *
 * Fix when it trips: move the helper/constant into a `lib/…` module and import
 * it into the route (and the test) from there.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ALLOWED = new Set([
  // HTTP method handlers
  "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
  // route segment config (https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)
  "dynamic", "dynamicParams", "revalidate", "fetchCache", "runtime",
  "preferredRegion", "maxDuration", "generateStaticParams",
]);

// All route files tracked by git under app/.
const files = execSync("git ls-files 'app/**/route.ts' 'app/**/route.tsx'", {
  encoding: "utf8",
})
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

// Matches: export const X / export function X / export async function X /
// export let X / export var X — capturing the exported identifier.
const RE = /export\s+(?:async\s+)?(?:const|function|let|var)\s+([A-Za-z0-9_$]+)/g;

const failures = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let m;
  while ((m = RE.exec(src)) !== null) {
    const name = m[1];
    if (!ALLOWED.has(name)) {
      const line = src.slice(0, m.index).split("\n").length;
      failures.push(`${file}:${line}  illegal route export "${name}"`);
    }
  }
  // Also catch `export { foo, bar }` re-export lists.
  const reList = /export\s*\{([^}]*)\}(?!\s*from)/g;
  let g;
  while ((g = reList.exec(src)) !== null) {
    for (const raw of g[1].split(",")) {
      const name = raw.split(/\s+as\s+/i).pop().trim();
      if (name && !ALLOWED.has(name)) {
        const line = src.slice(0, g.index).split("\n").length;
        failures.push(`${file}:${line}  illegal route export "${name}" (in export list)`);
      }
    }
  }
}

console.log(`route-export guard: scanned ${files.length} route file(s), ${failures.length} illegal export(s).`);
if (failures.length) {
  console.error("\n✗ route-export guard FAILED — a route.ts may only export HTTP handlers + segment config:");
  for (const f of failures) console.error("  • " + f);
  console.error(
    "\nMove the offending helper/constant into a lib/ module and import it into the route.\n" +
      "Otherwise `next build` fails in production with \"is not a valid Route export field\"."
  );
  process.exit(1);
}
console.log("\n✓ route-export guard passed — every route.ts exports only handlers + segment config.");
