import type { BbqStyle } from "./styles";

/**
 * Controlled vocabulary of what a place serves. Structured (not free text) so
 * it powers: an "On the Menu" section on detail pages, filters on the
 * directory + map ("show me turkey"), submission-form checkboxes, and
 * Menu/servesCuisine structured data for SEO/GEO.
 *
 * `styles` orders items smartly in the submission form (lead with the relevant
 * ones for the chosen style) — it never restricts what can be selected.
 */
export type OfferingCategory = "meats" | "fixings" | "sweets" | "drinks" | "extras";

export interface OfferingItem {
  slug: string;
  label: string;
  category: OfferingCategory;
  styles?: BbqStyle[];
}

export const OFFERING_CATEGORY_LABELS: Record<OfferingCategory, string> = {
  meats: "The Meats",
  fixings: "Sides & Fixings",
  sweets: "Sweets",
  drinks: "Drinks",
  extras: "Also Here",
};

export const OFFERING_CATEGORY_ORDER: OfferingCategory[] = [
  "meats",
  "fixings",
  "sweets",
  "drinks",
  "extras",
];

export const OFFERINGS: OfferingItem[] = [
  // Meats
  { slug: "brisket", label: "Brisket", category: "meats", styles: ["texas", "memphis"] },
  { slug: "beef-ribs", label: "Beef Ribs", category: "meats", styles: ["texas"] },
  { slug: "pork-ribs", label: "Pork Ribs", category: "meats", styles: ["memphis", "carolina", "texas"] },
  { slug: "pulled-pork", label: "Pulled Pork", category: "meats", styles: ["carolina", "memphis"] },
  { slug: "whole-hog", label: "Whole Hog", category: "meats", styles: ["carolina"] },
  { slug: "sausage", label: "Sausage & Hot Links", category: "meats", styles: ["texas"] },
  { slug: "turkey", label: "Smoked Turkey", category: "meats", styles: ["texas"] },
  { slug: "chicken", label: "Smoked Chicken", category: "meats", styles: ["carolina", "memphis"] },
  { slug: "burnt-ends", label: "Burnt Ends", category: "meats", styles: ["texas"] },
  { slug: "pork-belly", label: "Pork Belly", category: "meats", styles: ["korean", "yakiniku"] },
  { slug: "short-rib", label: "Short Rib (Galbi)", category: "meats", styles: ["korean"] },
  { slug: "picanha", label: "Picanha", category: "meats", styles: ["churrasco"] },
  { slug: "asado", label: "Asado Cuts", category: "meats", styles: ["asado"] },
  { slug: "lamb", label: "Lamb", category: "meats", styles: ["asado", "braai", "mangal", "other"] },
  { slug: "barbacoa", label: "Barbacoa", category: "meats", styles: ["mexican", "other"] },
  { slug: "bologna", label: "Smoked Bologna", category: "meats", styles: ["memphis"] },
  // Sides & fixings
  { slug: "mac-cheese", label: "Mac & Cheese", category: "fixings" },
  { slug: "coleslaw", label: "Coleslaw", category: "fixings" },
  { slug: "beans", label: "Pit Beans", category: "fixings" },
  { slug: "potato-salad", label: "Potato Salad", category: "fixings" },
  { slug: "cornbread", label: "Cornbread", category: "fixings" },
  { slug: "collard-greens", label: "Collard Greens", category: "fixings" },
  { slug: "pickles", label: "Pickles & Onions", category: "fixings" },
  { slug: "banchan", label: "Banchan", category: "fixings", styles: ["korean"] },
  { slug: "fries", label: "Fries", category: "fixings" },
  { slug: "elote", label: "Elote / Corn", category: "fixings" },
  // Sweets
  { slug: "banana-pudding", label: "Banana Pudding", category: "sweets" },
  { slug: "pecan-pie", label: "Pecan Pie", category: "sweets" },
  { slug: "peach-cobbler", label: "Peach Cobbler", category: "sweets" },
  { slug: "brownies", label: "Brownies", category: "sweets" },
  { slug: "ice-cream", label: "Ice Cream", category: "sweets" },
  // Drinks (light "nice to know" set — character + long-tail search)
  { slug: "craft-beer", label: "Craft Beer", category: "drinks" },
  { slug: "local-beer", label: "Local Beer", category: "drinks" },
  { slug: "sweet-tea", label: "Sweet Tea", category: "drinks" },
  { slug: "dr-pepper", label: "Dr Pepper", category: "drinks" },
  { slug: "coca-cola", label: "Coca-Cola", category: "drinks" },
  { slug: "pepsi", label: "Pepsi", category: "drinks" },
  { slug: "topo-chico", label: "Topo Chico", category: "drinks" },
  { slug: "margaritas", label: "Margaritas", category: "drinks" },
  { slug: "soft-drinks", label: "Soft Drinks", category: "drinks" },
  // Also here (retail / services)
  { slug: "house-sauce", label: "House Sauce", category: "extras" },
  { slug: "rubs", label: "Rubs & Spices", category: "extras" },
  { slug: "merch", label: "Merch", category: "extras" },
  { slug: "catering", label: "Catering", category: "extras" },
  { slug: "gift-cards", label: "Gift Cards", category: "extras" },
];

export const OFFERINGS_BY_SLUG: Record<string, OfferingItem> = Object.fromEntries(
  OFFERINGS.map((o) => [o.slug, o])
);

export type AlcoholPolicy = "none" | "serves" | "byob" | "both";

export const ALCOHOL_LABELS: Record<AlcoholPolicy, string> = {
  none: "No alcohol",
  serves: "Serves alcohol",
  byob: "BYOB",
  both: "Serves alcohol & BYOB",
};

/** Group a restaurant's offering slugs into ordered categories for display. */
export function groupOfferings(
  slugs: string[] | null | undefined
): { category: OfferingCategory; items: OfferingItem[] }[] {
  if (!slugs?.length) return [];
  const set = new Set(slugs);
  return OFFERING_CATEGORY_ORDER.map((category) => ({
    category,
    items: OFFERINGS.filter((o) => o.category === category && set.has(o.slug)),
  })).filter((group) => group.items.length > 0);
}
