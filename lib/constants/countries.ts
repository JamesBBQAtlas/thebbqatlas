/**
 * Turn a 2-letter ISO 3166-1 alpha-2 code into a flag emoji using regional
 * indicator symbols. Returns "" for missing/invalid codes so callers can
 * render it unconditionally.
 */
export function flagEmoji(code?: string | null): string {
  if (!code || code.length !== 2) return "";
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(
    ...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

/**
 * Canonical country NAME per country — one value each, so the directory shows a
 * single chip per country and counts add up. Variants (USA / U.S. / America,
 * México, UK / Britain, UAE, …) all collapse to the standard English name. Both
 * the seed data and the enrichment/roster output are normalised through this, so
 * it can't re-split as we enrich.
 */
const COUNTRY_CANONICAL: Record<string, string> = {
  usa: "United States",
  us: "United States",
  "united states": "United States",
  "united states of america": "United States",
  america: "United States",
  "u s": "United States",
  "u s a": "United States",
  uk: "United Kingdom",
  "united kingdom": "United Kingdom",
  "great britain": "United Kingdom",
  britain: "United Kingdom",
  england: "United Kingdom",
  scotland: "United Kingdom",
  wales: "United Kingdom",
  "northern ireland": "United Kingdom",
  mexico: "Mexico",
  uae: "United Arab Emirates",
  "united arab emirates": "United Arab Emirates",
  korea: "South Korea",
  "south korea": "South Korea",
  "republic of korea": "South Korea",
  "the netherlands": "Netherlands",
  holland: "Netherlands",
  // Native-script / native-language country names → canonical English (Build:
  // international venues default to English). toLowerCase + the NFD diacritic
  // strip above leave CJK/Arabic/Hangul untouched, so these match verbatim.
  brasil: "Brazil",
  brazil: "Brazil",
  eire: "Ireland", // "Éire" → diacritics stripped → "eire"
  ireland: "Ireland",
  "republic of ireland": "Ireland",
  japan: "Japan",
  "日本": "Japan",
  "日本国": "Japan",
  nippon: "Japan",
  nihon: "Japan",
  "대한민국": "South Korea",
  "한국": "South Korea",
  "الإمارات العربية المتحدة": "United Arab Emirates",
  españa: "Spain",
  espana: "Spain",
  deutschland: "Germany",
  italia: "Italy",
  "türkiye": "Turkey",
  turkiye: "Turkey",
  "中国": "China",
  "中國": "China",
  "台灣": "Taiwan",
  "台湾": "Taiwan",
  "ประเทศไทย": "Thailand",
  "việt nam": "Vietnam",
  "viet nam": "Vietnam",
};

/**
 * ISO 3166-1 alpha-2 / alpha-3 code → canonical English name. A bare code is
 * never a legitimate country NAME, so mapping it is safe — and it's what kills
 * the live "MX"/"DE" split (enrichment/geocoders return codes). Georgia's code
 * (GE/GA) is deliberately OMITTED — Georgia is ambiguous (country vs US state)
 * and must reach a human, never auto-convert.
 */
const CODE_TO_COUNTRY: Record<string, string> = {
  US: "United States", USA: "United States",
  GB: "United Kingdom", GBR: "United Kingdom",
  MX: "Mexico", MEX: "Mexico",
  DE: "Germany", DEU: "Germany",
  CA: "Canada", CAN: "Canada",
  AU: "Australia", AUS: "Australia",
  BR: "Brazil", BRA: "Brazil",
  JP: "Japan", JPN: "Japan",
  KR: "South Korea", KOR: "South Korea",
  AR: "Argentina", ARG: "Argentina",
  IE: "Ireland", IRL: "Ireland",
  ES: "Spain", ESP: "Spain",
  IT: "Italy", ITA: "Italy",
  FR: "France", FRA: "France",
  NL: "Netherlands", NLD: "Netherlands",
  BE: "Belgium", BEL: "Belgium",
  PT: "Portugal", PRT: "Portugal",
  ZA: "South Africa", ZAF: "South Africa",
  KE: "Kenya", KEN: "Kenya",
  SG: "Singapore", SGP: "Singapore",
  GT: "Guatemala", GTM: "Guatemala",
  PA: "Panama", PAN: "Panama",
  NZ: "New Zealand", NZL: "New Zealand",
  AE: "United Arab Emirates", ARE: "United Arab Emirates",
  UY: "Uruguay", URY: "Uruguay",
  CL: "Chile", CHL: "Chile",
  CO: "Colombia", COL: "Colombia",
  PE: "Peru", PER: "Peru",
  IL: "Israel", ISR: "Israel",
  CN: "China", CHN: "China",
  TW: "Taiwan", TWN: "Taiwan",
  HK: "Hong Kong", HKG: "Hong Kong",
  TH: "Thailand", THA: "Thailand",
  VN: "Vietnam", VNM: "Vietnam",
  PH: "Philippines", PHL: "Philippines",
  ID: "Indonesia", IDN: "Indonesia",
  MY: "Malaysia", MYS: "Malaysia",
  IN: "India", IND: "India",
  TR: "Turkey", TUR: "Turkey",
  PL: "Poland", POL: "Poland",
  SE: "Sweden", SWE: "Sweden",
  NO: "Norway", NOR: "Norway",
  DK: "Denmark", DNK: "Denmark",
  FI: "Finland", FIN: "Finland",
  AT: "Austria", AUT: "Austria",
  CH: "Switzerland", CHE: "Switzerland",
  CZ: "Czech Republic", CZE: "Czech Republic",
  GR: "Greece", GRC: "Greece",
};

/**
 * The canonical English country NAMES we accept as-is (ISO 3166 short names). A
 * write whose normalised country is NOT one of these is flagged for review, so we
 * never silently store junk. Kept broad enough that a legitimate new country is
 * never falsely flagged.
 */
const CANONICAL_COUNTRY_NAMES: string[] = [
  "United States", "United Kingdom", "Canada", "Mexico", "Germany", "France",
  "Spain", "Italy", "Portugal", "Netherlands", "Belgium", "Ireland", "Austria",
  "Switzerland", "Sweden", "Norway", "Denmark", "Finland", "Poland",
  "Czech Republic", "Greece", "Turkey", "Russia", "Ukraine", "Hungary",
  "Romania", "Croatia", "Serbia", "Bulgaria", "Iceland", "Luxembourg",
  "Australia", "New Zealand", "Japan", "South Korea", "China", "Taiwan",
  "Hong Kong", "Thailand", "Vietnam", "Philippines", "Indonesia", "Malaysia",
  "Singapore", "India", "Pakistan", "Bangladesh", "Sri Lanka", "Nepal",
  "United Arab Emirates", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman",
  "Israel", "Jordan", "Lebanon", "Egypt", "Morocco", "Tunisia", "Nigeria",
  "Kenya", "Ghana", "South Africa", "Tanzania", "Uganda", "Ethiopia",
  "Argentina", "Brazil", "Chile", "Uruguay", "Paraguay", "Bolivia", "Peru",
  "Colombia", "Ecuador", "Venezuela", "Guatemala", "Panama", "Costa Rica",
  "Honduras", "Nicaragua", "El Salvador", "Dominican Republic", "Cuba",
  "Jamaica", "Puerto Rico", "Georgia",
];

/**
 * Names that are ALSO a US state (or otherwise ambiguous) — never auto-accepted
 * on write; always flagged so a human confirms it's the COUNTRY, not the state.
 * "Georgia" is both a country and a US state (the build-prompt review case).
 */
const AMBIGUOUS_COUNTRY_NAMES = new Set<string>(["Georgia"]);

/** Diacritic-fold + lowercase, matching how canonicalCountry keys its lookups. */
function countryKey(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}

// Canonical-name lookup by folded key, so "france"/"FRANCE" → "France" (canonical
// casing) and isRecognizedCountry can trust the exact stored form.
const CANONICAL_BY_KEY: Record<string, string> = Object.fromEntries(
  CANONICAL_COUNTRY_NAMES.map((n) => [countryKey(n), n])
);

/**
 * Normalise a free-text country to its single canonical name. Handles ISO-2/ISO-3
 * codes (MX → Mexico), native-language names (Deutschland → Germany), spelling/
 * casing variants, and diacritics ("México" → "Mexico"). An unrecognised value is
 * returned trimmed (never lost) — callers use isRecognizedCountry to decide
 * whether to flag it for review.
 */
export function canonicalCountry(country: string | null | undefined): string {
  if (!country) return "";
  const raw = country.trim();
  if (!raw) return "";
  const key = countryKey(raw);
  // 1. Known variant / native name.
  if (COUNTRY_CANONICAL[key]) return COUNTRY_CANONICAL[key];
  // 2. A bare ISO code (the whole input is 2–3 letters). Diacritic inputs like
  //    "México" fold to length > 3 here, so they never hit the code path.
  const code = raw.toUpperCase().replace(/[^A-Z]/g, "");
  if ((code.length === 2 || code.length === 3) && CODE_TO_COUNTRY[code]) return CODE_TO_COUNTRY[code];
  // 3. Already a canonical name (any casing/diacritics) → canonical casing.
  if (CANONICAL_BY_KEY[key]) return CANONICAL_BY_KEY[key];
  // 4. Unknown — return raw so no data is lost; the write site flags it.
  return raw;
}

/**
 * Is this a country we can confidently store as-is? False for an unknown value
 * AND for a deliberately-ambiguous one ("Georgia"), both of which a write site
 * should flag needs_attention rather than store silently.
 */
export function isRecognizedCountry(country: string | null | undefined): boolean {
  if (!country || !country.trim()) return false;
  const c = canonicalCountry(country);
  if (AMBIGUOUS_COUNTRY_NAMES.has(c)) return false;
  return Boolean(CANONICAL_BY_KEY[countryKey(c)]);
}

/** Display name overrides for the stored short country text, where useful. */
export const COUNTRY_DISPLAY: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  AE: "United Arab Emirates",
  KR: "South Korea",
  NZ: "New Zealand",
  ZA: "South Africa",
};

export function countryName(code: string | null | undefined, fallback: string): string {
  if (code && COUNTRY_DISPLAY[code]) return COUNTRY_DISPLAY[code];
  return fallback;
}

/**
 * Reverse map: stored country text → ISO alpha-2, so the geocoder's country
 * constraint and the display name never disagree. DERIVED from CODE_TO_COUNTRY
 * (every canonical name that has an alpha-2 code gets the reverse entry) so the
 * two are one source of truth — plus a few text aliases (USA/UK/UAE) the geocoder
 * may still see. resolveCountryCode + geocode read this.
 */
export const COUNTRY_TO_CODE: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(CODE_TO_COUNTRY)
      .filter(([code]) => code.length === 2)
      .map(([code, name]) => [name, code])
  ),
  // Text aliases that aren't canonical names but the geocoder/data may carry.
  USA: "US",
  UK: "GB",
  UAE: "AE",
};

/** Use the stored code, or derive it from the country text as a fallback. */
export function resolveCountryCode(
  code: string | null | undefined,
  country: string | null | undefined
): string | null {
  if (code) return code;
  if (country && COUNTRY_TO_CODE[country]) return COUNTRY_TO_CODE[country];
  return null;
}
