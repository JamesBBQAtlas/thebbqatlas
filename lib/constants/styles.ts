export type BbqStyle =
  | "texas"
  | "carolina"
  | "korean"
  | "argentine"
  | "memphis"
  | "brazilian"
  | "japanese"
  | "other";

export const BBQ_STYLES: BbqStyle[] = [
  "texas",
  "carolina",
  "korean",
  "argentine",
  "memphis",
  "brazilian",
  "japanese",
  "other",
];

export const STYLE_LABELS: Record<BbqStyle, string> = {
  texas: "Texas",
  carolina: "Carolina",
  korean: "Korean",
  argentine: "Argentine",
  memphis: "Memphis",
  brazilian: "Brazilian",
  japanese: "Japanese",
  other: "Other",
};

/** Pin colours per Architecture Proposal — Texas updated to Blue #3B82F6 */
export const STYLE_PIN_COLORS: Record<BbqStyle, string> = {
  texas: "#3B82F6",
  carolina: "#EAB308",
  korean: "#3B82F6",
  argentine: "#22C55E",
  memphis: "#A855F7",
  brazilian: "#F97316",
  japanese: "#14B8A6",
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