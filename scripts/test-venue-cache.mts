/* Seed-cache-poison fix (BUILD PROMPT 75) — the retry + last-known-good core that
 * stops a transient DB blip becoming the hour-long "75-venue" freeze.
 * Run: node_modules/.bin/tsx scripts/test-venue-cache.mts
 */
import { readWithRetry, makeLkg } from "../lib/queries/read-retry";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}
const noop = async () => {};

console.log("\n[readWithRetry — a blip is retried away before any fallback]");
{
  let calls = 0;
  const flakyThenOk = async () => { calls++; if (calls < 3) throw new Error("blip"); return ["a", "b"]; };
  const out = await readWithRetry(flakyThenOk, { delaysMs: [0, 0], sleep: noop });
  ok("succeeds on the 3rd attempt (2 blips retried)", JSON.stringify(out) === JSON.stringify(["a", "b"]), { calls });
  ok("made exactly 3 attempts", calls === 3, { calls });
}

console.log("\n[readWithRetry — throws only after ALL attempts exhausted]");
{
  let calls = 0;
  const alwaysFails = async () => { calls++; throw new Error("down"); };
  let threw = false;
  try { await readWithRetry(alwaysFails, { delaysMs: [0, 0], sleep: noop }); }
  catch { threw = true; }
  ok("throws after exhausting retries", threw);
  ok("tried delays.length + 1 = 3 times", calls === 3, { calls });
}

console.log("\n[makeLkg — never treats empty/null as good]");
{
  const lkg = makeLkg<string[]>();
  ok("starts empty", lkg.get() === null);
  lkg.set([]); ok("empty array is NOT stored", lkg.get() === null);
  lkg.set(null); ok("null is NOT stored", lkg.get() === null);
  lkg.set(["x"]); ok("a real value is stored", JSON.stringify(lkg.get()) === JSON.stringify(["x"]));
  lkg.set([]); ok("a later empty does NOT clobber the good value", JSON.stringify(lkg.get()) === JSON.stringify(["x"]));
}

// Mirror of getRestaurants()'s resolution WITHOUT unstable_cache, to prove the
// behaviour the cache layer then preserves: throw → serve LKG/seed, self-heal next call.
async function resolve(reader: () => Promise<string[]>, lkg: ReturnType<typeof makeLkg<string[]>>, seed: string[]) {
  try {
    const v = await readWithRetry(reader, { delaysMs: [0, 0], sleep: noop });
    lkg.set(v);
    return v;
  } catch {
    return lkg.get() ?? seed;
  }
}

console.log("\n[end-to-end resolution — self-heal + last-known-good over seed]");
{
  const SEED = ["seed75"];
  const lkg = makeLkg<string[]>();

  // 1) Cold instance, DB down, no LKG yet → seed (the true last-resort).
  const r1 = await resolve(async () => { throw new Error("down"); }, lkg, SEED);
  ok("outage with no LKG yet → seed", JSON.stringify(r1) === JSON.stringify(SEED));

  // 2) DB recovers → real data, and it becomes the new last-known-good.
  const r2 = await resolve(async () => ["real1", "real2", "real3"], lkg, SEED);
  ok("next successful call returns REAL data (self-heals — not frozen on seed)", r2.length === 3, r2);

  // 3) Another blip AFTER we've had a success → serve last-known-good REAL data, NOT the seed.
  const r3 = await resolve(async () => { throw new Error("blip"); }, lkg, SEED);
  ok("later outage serves last-known-good real data, never the seed", JSON.stringify(r3) === JSON.stringify(["real1", "real2", "real3"]), r3);
  ok("…and specifically is NOT the seed", JSON.stringify(r3) !== JSON.stringify(SEED));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
