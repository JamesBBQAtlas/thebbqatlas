/* Tolerant model-JSON extraction (#213). Pure + network-free.
 * Run: node_modules/.bin/tsx scripts/test-model-json.mts
 */
import { extractJsonObject, tryParseModelJson } from "../lib/ai/json";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

type J = { a?: number; b?: number; x?: { y?: number }; desc?: string; hook?: string };

console.log("\n[#213] tryParseModelJson recovers usable JSON from imperfect responses");
ok("a clean object parses", tryParseModelJson<J>('{"a":1}')?.a === 1);
ok("a ```json fenced block", tryParseModelJson<J>('```json\n{"a":2}\n```')?.a === 2);
ok("a plain ``` fence", tryParseModelJson<J>('```\n{"a":3}\n```')?.a === 3);
ok("prose before AND after the object", tryParseModelJson<J>('Sure! Here you go:\n{"a":4}\nHope that helps.')?.a === 4);
ok("a brace inside a string value doesn't end the object early", tryParseModelJson<J>('{"desc":"a } brace inside","a":5}')?.a === 5);
ok("nested objects parse", tryParseModelJson<J>('{"x":{"y":6}}')?.x?.y === 6);
ok("escaped quote inside a string is handled", tryParseModelJson<J>('{"desc":"he said \\"hi\\"","a":7}')?.a === 7);

console.log("\n[#213] unrecoverable input returns null — never throws, never a raw error");
ok("truncated mid-object → null", tryParseModelJson<J>('{"a":1, "b":') === null);
ok("pure prose, no object → null", tryParseModelJson<J>('I could not find anything to return.') === null);
ok("empty / null / whitespace → null", tryParseModelJson<J>('') === null && tryParseModelJson<J>(null) === null && tryParseModelJson<J>('   ') === null);

console.log("\n[#213] extractJsonObject returns the balanced substring");
ok("balanced object pulled out of surrounding noise", extractJsonObject('noise before {"a":1} tail after') === '{"a":1}');
ok("first balanced object wins", extractJsonObject('{"a":1} {"b":2}') === '{"a":1}');
ok("unbalanced → null", extractJsonObject('{"a": {"b": 1}') === null);
ok("no brace → null", extractJsonObject('nothing here') === null);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
