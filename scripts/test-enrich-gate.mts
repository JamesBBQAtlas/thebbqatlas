/**
 * Unit tests for the Part 5 item-type classifier + the Part 2 moderation gate
 * decision (pure logic). Run: npm run test:enrich-gate
 */
import {
  normalizeItemCategory,
  isDineInCategory,
  categoryGate,
} from "../lib/constants/item-categories";

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

console.log("\n[normalizeItemCategory]");
ok("exact enum value passes through", normalizeItemCategory("school") === "school");
ok("'Cooking School' → school", normalizeItemCategory("Cooking School") === "school");
ok("'catering' → caterer", normalizeItemCategory("catering") === "caterer");
ok("'Shop / Retailer' → retailer", normalizeItemCategory("Shop / Retailer") === "retailer");
ok("'sauce' brand → retailer", normalizeItemCategory("sauce") === "retailer");
ok("'food truck' → food_truck", normalizeItemCategory("food truck") === "food_truck");
ok("'consultancy' → school", normalizeItemCategory("consultancy") === "school");
ok("garbage → null (never guess)", normalizeItemCategory("???") === null);
ok("empty → null", normalizeItemCategory("") === null);

console.log("\n[isDineInCategory]");
ok("restaurant is dine-in", isDineInCategory("restaurant") === true);
ok("food_truck is dine-in", isDineInCategory("food_truck") === true);
ok("school is NOT dine-in", isDineInCategory("school") === false);
ok("caterer is NOT dine-in", isDineInCategory("caterer") === false);
ok("null is NOT dine-in", isDineInCategory(null) === false);

console.log("\n[categoryGate — the moderation gate]");

// A plain restaurant classified on enrich: write it, no flag.
{
  const g = categoryGate({ manualSet: false, proposed: "restaurant", current: "restaurant" });
  ok("restaurant: not non-venue, not unclear", !g.nonVenue && !g.unclear);
  ok("restaurant: no write when unchanged", g.write === null);
}

// The Wilson's cooking-school case: import defaulted to 'restaurant', enrich
// reclassifies as school → write school, held out of approved, preserved.
{
  const g = categoryGate({ manualSet: false, proposed: "school", current: "restaurant" });
  ok("cooking school: flagged non-venue", g.nonVenue === true);
  ok("cooking school: writes the reclassified type", g.write === "school");
  ok("cooking school: effective is school", g.effective === "school");
}

// Operator confirmed the type (manual) — a later enrich must NOT reclassify it.
{
  const g = categoryGate({ manualSet: true, proposed: "restaurant", current: "school" });
  ok("manual school protected: no write", g.write === null);
  ok("manual school protected: still non-venue", g.nonVenue === true);
  ok("manual school protected: effective stays school", g.effective === "school");
}

// Grok couldn't classify and nothing confirmed → flag "set manually".
{
  const g = categoryGate({ manualSet: false, proposed: null, current: "restaurant" });
  ok("unclear: flagged when proposal is null and unconfirmed", g.unclear === true);
  ok("unclear: does not silently pass as a dine-in venue", g.unclear === true && !g.nonVenue);
  ok("unclear: writes nothing", g.write === null);
}

// A previously-classified non-venue whose re-enrich returned null: stays held.
{
  const g = categoryGate({ manualSet: false, proposed: null, current: "caterer" });
  ok("stored caterer stays non-venue on a null re-classify", g.nonVenue === true);
  ok("stored caterer is not treated as 'unclear'", g.unclear === false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
