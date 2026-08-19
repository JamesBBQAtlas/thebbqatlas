/* Photo safety screen (Prompt 4) — the pure verdict classifier. The vision call itself
 * needs XAI_API_KEY and isn't exercised here; this locks down the fail-safe logic.
 * Run: node_modules/.bin/tsx scripts/test-photo-safety.mts
 */
import { classifyPhotoSafety, SAFETY_CATEGORIES } from "../lib/ai/photo-safety";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

console.log("\n[classifyPhotoSafety — pass vs flag]");
{
  const okFood = classifyPhotoSafety({ unsafe: false, categories: ["none"], confidence: 0.02, reason: "brisket plate" });
  ok("normal food → pass", okFood.status === "pass", okFood);
  ok("pass label is 'ok'", okFood.label === "ok");
  ok("'none' category is dropped from the list", okFood.categories.length === 0);

  const violent = classifyPhotoSafety({ unsafe: true, categories: ["violence"], confidence: 0.8, reason: "fight" });
  ok("model unsafe=true → flag", violent.status === "flag", violent);
  ok("flag label = first category", violent.label === "violence");
  ok("score carried through", violent.score === 0.8);
}

console.log("\n[fail-safe — always-flag categories flag even if model says unsafe:false]");
{
  for (const cat of ["sexual", "nudity", "gore", "csam"]) {
    const v = classifyPhotoSafety({ unsafe: false, categories: [cat], confidence: 0.1 });
    ok(`${cat} forces a flag despite unsafe:false`, v.status === "flag", v);
  }
  // 'weapons' alone is NOT in the always-flag set — respects the model's own call.
  const weaponsOnly = classifyPhotoSafety({ unsafe: false, categories: ["weapons"], confidence: 0.3 });
  ok("weapons + unsafe:false → pass (model's call respected)", weaponsOnly.status === "pass", weaponsOnly);
}

console.log("\n[robustness — junk payloads never throw, never silently pass unsafe]");
{
  ok("empty object → pass (nothing to flag)", classifyPhotoSafety({}).status === "pass");
  ok("null → pass", classifyPhotoSafety(null).status === "pass");
  const clamp = classifyPhotoSafety({ unsafe: true, confidence: 5 });
  ok("confidence clamped to ≤1", clamp.score === 1, clamp);
  const negc = classifyPhotoSafety({ unsafe: true, confidence: -3 });
  ok("negative confidence clamped to ≥0", negc.score === 0);
  const junkCats = classifyPhotoSafety({ unsafe: true, categories: ["banana", "nudity", 42] });
  ok("unknown categories filtered, known kept", junkCats.categories.includes("nudity") && !junkCats.categories.includes("banana" as never), junkCats);
  ok("string 'true' unsafe also flags", classifyPhotoSafety({ unsafe: "true" }).status === "flag");
}

console.log("\n[category set includes csam + none sentinel]");
{
  ok("csam is a category", (SAFETY_CATEGORIES as readonly string[]).includes("csam"));
  ok("none is a category", (SAFETY_CATEGORIES as readonly string[]).includes("none"));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
