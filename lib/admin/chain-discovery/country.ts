/**
 * Country anchoring for chain discovery (Part 1, §3) — GENERAL, no per-chain
 * logic. A chain's country is anchored from the chain itself: first its site
 * TLD, and when that is generic (.com/.net/…), from the addresses on its own
 * pages. Never defaults to the US.
 *
 * All returned country names are canonical (they pass through the app's
 * `canonicalCountry`, so they match what the rest of the pipeline stores).
 */
import { canonicalCountry } from "@/lib/constants/countries";

/** ccTLD → canonical country name. Generic TLDs are deliberately absent — a
 *  generic TLD yields null so the caller derives country from addresses. */
const TLD_COUNTRY: Record<string, string> = {
  au: "Australia",
  uk: "United Kingdom",
  ie: "Ireland",
  ca: "Canada",
  nz: "New Zealand",
  za: "South Africa",
  de: "Germany",
  fr: "France",
  es: "Spain",
  it: "Italy",
  nl: "Netherlands",
  be: "Belgium",
  ch: "Switzerland",
  at: "Austria",
  se: "Sweden",
  no: "Norway",
  dk: "Denmark",
  fi: "Finland",
  pt: "Portugal",
  pl: "Poland",
  br: "Brazil",
  mx: "Mexico",
  ar: "Argentina",
  cl: "Chile",
  jp: "Japan",
  kr: "South Korea",
  cn: "China",
  hk: "Hong Kong",
  tw: "Taiwan",
  sg: "Singapore",
  my: "Malaysia",
  th: "Thailand",
  ph: "Philippines",
  id: "Indonesia",
  in: "India",
  ae: "United Arab Emirates",
  sa: "Saudi Arabia",
  qa: "Qatar",
  il: "Israel",
  tr: "Turkey",
  gr: "Greece",
};

/** Generic/gTLDs that carry no country signal. */
const GENERIC_TLD = new Set([
  "com", "net", "org", "co", "io", "app", "shop", "store", "biz", "info",
  "restaurant", "bbq", "food", "us", // .us is generic-ish; US is derived from addresses instead
]);

/**
 * Country from a hostname's TLD, or null when the TLD carries no country signal.
 * Handles multi-part ccTLDs (`.com.au` → au, `.co.uk` → uk).
 */
export function countryFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const clean = host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  const parts = clean.split(".");
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  // For `.com.au`, `.co.uk` the meaningful ccTLD is the final label.
  if (TLD_COUNTRY[last]) return TLD_COUNTRY[last];
  if (GENERIC_TLD.has(last)) return null;
  return null;
}

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);
const AU_STATES = new Set(["NSW","VIC","QLD","WA","SA","TAS","ACT","NT"]);
const CA_PROV = new Set(["ON","QC","BC","AB","MB","SK","NS","NB","NL","PE","NT","YT","NU"]);

const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
const CA_POSTCODE = /\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/i;
const US_ZIP = /\b\d{5}(?:-\d{4})?\b/;
const AU_POSTCODE = /\b\d{4}\b/;

/** Explicit country words that may appear at the end of an address line. */
const COUNTRY_WORDS: [RegExp, string][] = [
  [/\bunited states\b|\bu\.?s\.?a\.?\b/i, "United States"],
  [/\bunited kingdom\b|\bu\.?k\.?\b|\bengland\b|\bscotland\b|\bwales\b|\bnorthern ireland\b/i, "United Kingdom"],
  [/\baustralia\b/i, "Australia"],
  [/\bcanada\b/i, "Canada"],
  [/\bnew zealand\b/i, "New Zealand"],
  [/\bireland\b/i, "Ireland"],
  [/\bsouth africa\b/i, "South Africa"],
  [/\bsingapore\b/i, "Singapore"],
  [/\bunited arab emirates\b|\buae\b/i, "United Arab Emirates"],
];

/** Score a single address string for country signals; returns a country or null. */
export function countryFromAddress(address: string | null | undefined): string | null {
  const s = (address ?? "").trim();
  if (!s) return null;
  for (const [re, country] of COUNTRY_WORDS) if (re.test(s)) return country;

  const upper = s.toUpperCase();
  const tokens = upper.split(/[\s,]+/);
  const hasState = (set: Set<string>) => tokens.some((t) => set.has(t));

  // Postcode-shaped signals are the strongest structural hints.
  if (UK_POSTCODE.test(s)) return "United Kingdom";
  if (CA_POSTCODE.test(s) && hasState(CA_PROV)) return "Canada";
  if (hasState(AU_STATES) && AU_POSTCODE.test(s) && !US_ZIP.test(s)) return "Australia";
  if (hasState(US_STATES) && US_ZIP.test(s)) return "United States";
  // Weaker: a bare state/province token.
  if (hasState(AU_STATES)) return "Australia";
  if (hasState(US_STATES)) return "United States";
  if (hasState(CA_PROV)) return "Canada";
  return null;
}

/**
 * Anchor the chain's country. TLD wins when it carries a signal; otherwise the
 * majority country across the discovered addresses. Returns null if nothing can
 * be determined (caller flags rather than defaulting to US).
 */
export function anchorCountry(
  host: string | null | undefined,
  addresses: (string | null | undefined)[]
): string | null {
  const fromTld = countryFromHost(host);
  if (fromTld) return canonicalCountry(fromTld);

  const votes = new Map<string, number>();
  for (const a of addresses) {
    const c = countryFromAddress(a);
    if (c) votes.set(c, (votes.get(c) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [c, n] of votes) if (n > bestN) { best = c; bestN = n; }
  return best ? canonicalCountry(best) : null;
}
