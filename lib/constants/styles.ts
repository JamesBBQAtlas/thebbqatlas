export type BbqStyle =
  | "texas"
  | "carolina"
  | "memphis"
  | "kansas-city"
  | "alabama"
  | "asado"
  | "churrasco"
  | "mexican"
  | "korean"
  | "yakiniku"
  | "braai"
  | "nyama-choma"
  | "mangal"
  | "modern"
  | "other";

// Ordered for the filter menus: US regional → Latin America → Asia → Africa →
// Middle East → catch-alls.
export const BBQ_STYLES: BbqStyle[] = [
  "texas",
  "carolina",
  "memphis",
  "kansas-city",
  "alabama",
  "asado",
  "churrasco",
  "mexican",
  "korean",
  "yakiniku",
  "braai",
  "nyama-choma",
  "mangal",
  "modern",
  "other",
];

export const STYLE_LABELS: Record<BbqStyle, string> = {
  texas: "Texas",
  carolina: "Carolina",
  memphis: "Memphis",
  "kansas-city": "Kansas City",
  alabama: "Alabama",
  asado: "Asado",
  churrasco: "Churrasco",
  mexican: "Mexican",
  korean: "Korean",
  yakiniku: "Yakiniku",
  braai: "Braai",
  "nyama-choma": "Nyama Choma",
  mangal: "Mangal / Kebab",
  modern: "Modern",
  other: "Other",
};

/**
 * A short, human description of each style's defining trait — used for tooltips,
 * detail-page context and Menu/servesCuisine structured data.
 */
export const STYLE_DESCRIPTIONS: Record<BbqStyle, string> = {
  texas: "Post-oak-smoked beef — brisket, beef ribs and hot-gut sausage.",
  carolina: "Whole-hog and pulled pork with vinegar or mustard sauce.",
  memphis: "Dry-rubbed pork ribs and pulled pork; wet or dry.",
  "kansas-city": "Slow-smoked ribs and burnt ends with thick, sweet sauce.",
  alabama: "Smoked chicken dressed in tangy white mayo-vinegar sauce.",
  asado: "Live-fire beef on the parrilla — the South American asado.",
  churrasco: "Brazilian spit-roasted meats carved tableside (rodízio).",
  mexican: "Barbacoa, cabrito and carne asada over mesquite and pit.",
  korean: "Tabletop-grilled marinated beef and pork with banchan.",
  yakiniku: "Japanese charcoal-grilled wagyu and premium cuts.",
  braai: "South African open-fire grilling — boerewors and sosaties.",
  "nyama-choma": "East African wood-grilled meat served with ugali.",
  mangal: "Middle-Eastern & Levantine charcoal kebabs and köfte.",
  modern: "Contemporary, boundary-pushing global smokehouse cooking.",
  other: "Regional and fusion barbecue traditions worldwide.",
};

/** Pin colours per Architecture Proposal — Texas updated to Blue #3B82F6 */
export const STYLE_PIN_COLORS: Record<BbqStyle, string> = {
  texas: "#3B82F6",
  carolina: "#EAB308",
  memphis: "#A855F7",
  "kansas-city": "#EF4444",
  alabama: "#CBD5E1",
  asado: "#22C55E",
  churrasco: "#F97316",
  mexican: "#E11D48",
  korean: "#EC4899",
  yakiniku: "#14B8A6",
  braai: "#CA8A04",
  "nyama-choma": "#B45309",
  mangal: "#F59E0B",
  modern: "#94A3B8",
  other: "#6B7280",
};

export const STYLE_LEGEND = BBQ_STYLES.map((style) => ({
  style,
  label: STYLE_LABELS[style],
  color: STYLE_PIN_COLORS[style],
}));

export const BRAND = {
  name: "The BBQ Atlas",
  strapline: "Real BBQ. Real Time. Shared Worldwide.",
  siteUrl: "https://thebbqatlas.com",
} as const;