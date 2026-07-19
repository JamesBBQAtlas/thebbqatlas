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
