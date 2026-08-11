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
 * Normalise a free-text country to its single canonical name. Diacritics and
 * punctuation are stripped for matching ("México" → "Mexico"); an unknown value
 * is returned trimmed so we never lose data.
 */
export function canonicalCountry(country: string | null | undefined): string {
  if (!country) return "";
  const raw = country.trim();
  if (!raw) return "";
  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return COUNTRY_CANONICAL[key] ?? raw;
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

/** Reverse map: stored country text → ISO alpha-2 (resilience for data
 * without a country_code, e.g. the bundled fallback dataset). */
export const COUNTRY_TO_CODE: Record<string, string> = {
  USA: "US",
  // The CANONICAL display names (what canonicalCountry() stores) must map too —
  // without these, resolveCountryCode("United States") returned null and the
  // geocoder's country constraint silently never applied for the US/UK/UAE.
  "United States": "US",
  "United Kingdom": "GB",
  "United Arab Emirates": "AE",
  UK: "GB",
  "South Korea": "KR",
  Canada: "CA",
  Argentina: "AR",
  Mexico: "MX",
  Japan: "JP",
  Australia: "AU",
  Brazil: "BR",
  Germany: "DE",
  Ireland: "IE",
  Guatemala: "GT",
  Singapore: "SG",
  Panama: "PA",
  "New Zealand": "NZ",
  UAE: "AE",
  Uruguay: "UY",
  Chile: "CL",
  Israel: "IL",
  Netherlands: "NL",
  "South Africa": "ZA",
  Kenya: "KE",
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
