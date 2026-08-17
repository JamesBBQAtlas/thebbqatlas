/* Part 7 — directory pagination helpers. Pure guard: bounded slices, clamped pages,
 * canonical page paths (page 1 = bare, no ?page=1 duplicate), and a compact windowed
 * page list. Run: node_modules/.bin/tsx scripts/test-directory-paginate.mts
 */
import {
  paginate,
  parsePageParam,
  pagePath,
  pageWindow,
  DIRECTORY_PAGE_SIZE,
} from "../lib/directory/paginate";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

const items = Array.from({ length: 50 }, (_, i) => i + 1);

console.log("\n[parsePageParam — coerce untrusted ?page]");
ok("'2' → 2", parsePageParam("2") === 2);
ok("undefined → 1", parsePageParam(undefined) === 1);
ok("'0' → 1", parsePageParam("0") === 1);
ok("'abc' → 1", parsePageParam("abc") === 1);
ok("'-3' → 1", parsePageParam("-3") === 1);
ok("array ['3'] → 3", parsePageParam(["3"]) === 3);

console.log("\n[paginate — bounded slice, clamped, cheap total]");
{
  const p1 = paginate(items, 1);
  ok("page size is 24", DIRECTORY_PAGE_SIZE === 24 && p1.items.length === 24);
  ok("page 1: first item 1, hasPrev false, hasNext true", p1.items[0] === 1 && !p1.hasPrev && p1.hasNext);
  ok("total + totalPages reported (50 / 24 = 3)", p1.total === 50 && p1.totalPages === 3);
  const p2 = paginate(items, 2);
  ok("page 2: starts at 25, both neighbours", p2.items[0] === 25 && p2.hasPrev && p2.hasNext);
  const p3 = paginate(items, 3);
  ok("page 3: 2 items, hasNext false", p3.items.length === 2 && p3.items[0] === 49 && !p3.hasNext);
  const over = paginate(items, 99);
  ok("out-of-range page clamps to the last page", over.page === 3 && over.items[0] === 49);
  const empty = paginate([], 1);
  ok("empty list → 1 page, no items", empty.totalPages === 1 && empty.items.length === 0);
}

console.log("\n[pagePath — page 1 is the bare path (no ?page=1 duplicate)]");
ok("page 1 → bare", pagePath("/directory/uk", 1) === "/directory/uk");
ok("page 3 → ?page=3", pagePath("/directory/uk", 3) === "/directory/uk?page=3");

console.log("\n[pageWindow — compact, always includes first + last]");
{
  const w = pageWindow(5, 10);
  ok("window around 5 of 10 → 1 … 4 5 6 … 10", JSON.stringify(w) === JSON.stringify([1, null, 4, 5, 6, null, 10]), w);
  ok("single page → [1]", JSON.stringify(pageWindow(1, 1)) === JSON.stringify([1]));
  ok("no elision when contiguous (page 2 of 3)", JSON.stringify(pageWindow(2, 3)) === JSON.stringify([1, 2, 3]));
  const near = pageWindow(1, 5);
  ok("first + last always present", near[0] === 1 && near[near.length - 1] === 5);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
