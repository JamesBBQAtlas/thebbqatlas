/**
 * The `map_item_category` enum, in ONE place (Part 5). Shared by the server
 * enrichment classifier (`lib/ai/enrich.ts` re-exports these) and the client
 * admin UI (VenueHub row badge + editor dropdown), so the values and human
 * labels can never drift apart. Values/order MUST match the DB enum and the
 * Add-listing "Item type" dropdown.
 */
export const ITEM_CATEGORIES = [
  "restaurant",
  "food_truck",
  "caterer",
  "retailer",
  "market",
  "event",
  "festival",
  "school",
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** Human label for an item type — for `attention_reason`, badges, dropdowns. */
export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  restaurant: "Restaurant",
  food_truck: "Food truck",
  caterer: "Caterer",
  retailer: "Shop / retailer",
  market: "Market",
  event: "Event",
  festival: "Festival",
  school: "Cooking school",
};

/**
 * The dine-in item types we onboard in the CURRENT venues-only phase. Anything
 * outside this set is a non-visitable listing the moderation gate (Part 2) holds
 * out of `approved` and flags for a later wave.
 */
export const DINE_IN_CATEGORIES = new Set<ItemCategory>(["restaurant", "food_truck"]);

/** True when a category is a dine-in venue type (restaurant / food_truck). */
export function isDineInCategory(c: ItemCategory | null | undefined): boolean {
  return Boolean(c && DINE_IN_CATEGORIES.has(c));
}

/** Dropdown options for the admin UI (Add-listing + editor). */
export const ITEM_CATEGORY_OPTIONS = ITEM_CATEGORIES.map((slug) => ({
  slug,
  label: ITEM_CATEGORY_LABELS[slug],
}));

/**
 * The Part 2 + Part 5 moderation-gate decision for an item type, as a pure
 * function so it's unit-testable. Given whether the operator has confirmed a type
 * (`manualSet`), the fresh classification from this enrich (`proposed`), and the
 * stored value (`current`), it returns:
 *   • `effective` — the type we treat the venue as (manual wins; else proposed
 *      else current);
 *   • `write` — the value to persist this run (only a fresh, changed, UNprotected
 *      classification; null = leave the stored value alone);
 *   • `nonVenue` — effective type is not a dine-in venue → hold out of approved;
 *   • `unclear` — nothing could be classified and nothing is confirmed → flag
 *      "set manually" rather than silently passing as the 'restaurant' default.
 */
export function categoryGate(input: {
  manualSet: boolean;
  proposed: ItemCategory | null;
  current: ItemCategory | null;
}): {
  effective: ItemCategory | null;
  write: ItemCategory | null;
  nonVenue: boolean;
  unclear: boolean;
} {
  const { manualSet, proposed, current } = input;
  const effective = manualSet ? current : proposed ?? current;
  const nonVenue = Boolean(effective && !isDineInCategory(effective));
  const unclear = !manualSet && !proposed && !nonVenue;
  const write = !manualSet && proposed && proposed !== current ? proposed : null;
  return { effective, write, nonVenue, unclear };
}

/** Normalise a free-text category guess (model output / sheet cell) to the enum. */
export function normalizeItemCategory(v: unknown): ItemCategory | null {
  const c =
    typeof v === "string" ? v.trim().toLowerCase().replace(/[\s/-]+/g, "_") : "";
  const alias: Record<string, ItemCategory> = {
    shop: "retailer",
    shop_retailer: "retailer",
    store: "retailer",
    merch: "retailer",
    merchandise: "retailer",
    sauce: "retailer",
    seasoning: "retailer",
    brand: "retailer",
    catering: "caterer",
    cooking_school: "school",
    class: "school",
    classes: "school",
    educator: "school",
    education: "school",
    consultancy: "school",
    truck: "food_truck",
    foodtruck: "food_truck",
    trailer: "food_truck",
    popup: "food_truck",
    pop_up: "food_truck",
  };
  if ((ITEM_CATEGORIES as readonly string[]).includes(c)) return c as ItemCategory;
  return alias[c] ?? null;
}
