/**
 * Address helpers (§09.2.6 / §09.2.2). Two jobs:
 *  - compose a FULL address (street, city, region/state, postcode) without
 *    duplicating parts the dossier already folded together;
 *  - normalise a street/city string so the SAME physical location matches
 *    however it's spelled ("Olathe" vs "Olathe, KS"), for chain dedupe.
 */

const clean = (v: string | null | undefined): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";

/**
 * Fold accents / diacritics to ASCII so the SAME place matches however it's
 * accented: "Elías" → "Elias", "García" → "Garcia", "São" → "Sao", "ñ" → "n".
 * Used by every identity normalizer below, so a diacritic-only spelling variant
 * (the Old Jimmy's dupe) can never split one physical location into two records.
 */
export function foldDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Build a full address from dossier parts, skipping any token already present
 * in what we've accumulated (so a street that already contains the city/zip
 * isn't doubled up). Produces e.g. "3002 W 47th Ave, Kansas City, KS 66103".
 */
export function composeAddress(parts: {
  street?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
}): string {
  const acc: string[] = [];
  const push = (v: string | null | undefined) => {
    const s = clean(v);
    if (!s) return;
    if (acc.join(", ").toLowerCase().includes(s.toLowerCase())) return;
    acc.push(s);
  };
  push(parts.street);
  push(parts.city);
  push([clean(parts.region), clean(parts.postcode)].filter(Boolean).join(" "));
  return acc.join(", ");
}

/**
 * Normalise a CITY to the SETTLEMENT, not the administrative district (§09.2.7).
 * A pin's postcode and full street address stay precise; only the grouping
 * `city` is cleaned so "City of Westminster" and "Greater London" don't sit as
 * their own countries-of-one on the directory. Conservative and UK-focused:
 * only the explicit ADMIN-DISTRICT forms are rewritten — a bare locality
 * ("Bermondsey", "Croydon") is left exactly as entered.
 *   "Greater London" / "City of Westminster" / "City of London"  → "London"
 *   "London Borough of Hackney" / "Royal Borough of Greenwich"    → "London"
 *   "City of Nottingham"                                          → "Nottingham"
 *   "Royal Borough of Kingston upon Thames"                       → "London"
 *   "Borough of Poole" / "Poole Borough"                          → "Poole"
 */
export function settlementCity(city: string | null | undefined): string {
  const raw = clean(city);
  if (!raw) return "";
  const low = raw.toLowerCase();

  // The Greater London family — the whole conurbation is addressed as "London".
  if (low === "greater london" || low === "city of london" || low === "city of westminster") {
    return "London";
  }
  // Any London borough (incl. the two royal boroughs inside London) → "London".
  if (/\blondon borough of\b/.test(low)) return "London";
  const LONDON_ROYAL = new Set([
    "royal borough of kensington and chelsea",
    "royal borough of greenwich",
    "royal borough of kingston upon thames",
  ]);
  if (LONDON_ROYAL.has(low)) return "London";

  // "City of X" → the settlement X (City of Nottingham → Nottingham).
  let m = raw.match(/^city of\s+(.+)$/i);
  if (m) return m[1].trim();
  // "Royal/Metropolitan/plain Borough of X" → X.
  m = raw.match(/^(?:royal\s+|metropolitan\s+)?borough of\s+(.+)$/i);
  if (m) return m[1].trim();
  // Trailing admin suffix ("Poole Borough", "X District Council") → X.
  const stripped = raw
    .replace(/\s+(?:metropolitan borough|borough council|borough|district council|district|council)$/i, "")
    .trim();
  return stripped || raw;
}

/**
 * Does this "city" value look like a POI / landmark / retail site rather than a
 * town? A reverse-geocode or a bad facts sheet can drop a shopping centre,
 * station or mall name into the city field ("Westmorland Shopping Centre" for a
 * venue that's actually in Kendal). Those must be rejected — the city has to be
 * the postal town. Conservative: only clear POI indicators, never plausible town
 * names (a real "…Park" or "…Market" town isn't caught).
 */
export function looksLikePoiCity(city: string | null | undefined): boolean {
  const s = clean(city).toLowerCase();
  if (!s) return false;
  return /shopping\s*cent(?:re|er)|retail\s*park|outlet|\bmall\b|\bplaza\b|\barcade\b|\bstation\b|\bairport\b|\bterminal\b|\bprecinct\b|\bstadium\b|\bshopping\b/.test(
    s
  );
}

/**
 * Does this "city" value look like a NEIGHBOURHOOD / sub-locality / civic-
 * association label rather than a real town? A reverse-geocode (MapTiler /
 * Nominatim) can return a fine-grained locality — a "super-neighbourhood" or a
 * civic association — as the place name: e.g. "Washington Avenue Coalition /
 * Memorial Park" for a venue that's actually in Houston. Those must be rejected
 * as cities. Conservative on purpose — only clear neighbourhood/civic tells:
 *   • a slashed dual label "A / B" (MapTiler's neighbourhood-feature signature);
 *   • coalition / neighbourhood / super-neighbourhood / (civic|residents')
 *     association / civic / homeowners / HOA.
 * Ambiguous cases (a bare "…District", "…Ward", "…Quarter" that might be a real
 * place) are deliberately NOT hard-rejected here — bestSettlement's
 * "prefer the town that appears in the address" rule handles those without risk
 * of dropping a genuine town name.
 */
export function looksLikeSubLocality(city: string | null | undefined): boolean {
  const s = clean(city);
  if (!s) return false;
  // "A / B" slashed dual label — MapTiler neighbourhood signature.
  if (/\s\/\s/.test(s)) return true;
  const low = s.toLowerCase();
  return /\b(coalition|neighbou?rhood|super[-\s]*neighbou?rhood|(?:civic|residents?|homeowners?|home\s*owners?|property\s*owners?)\s*(?:association|assn)|civic\s*club|h\.?o\.?a\.?)\b/.test(
    low
  );
}

/**
 * Is this a real, storable TOWN — not a POI/landmark, not a county/state/
 * province, and not a neighbourhood/civic-association label?
 */
export function isRealTown(city: string | null | undefined): boolean {
  const s = clean(city);
  return Boolean(s) && !looksLikePoiCity(s) && !looksLikeRegion(s) && !looksLikeSubLocality(s);
}

/** Country / UK-nation tokens we drop from the tail of an address when hunting
 *  for the town. */
const ADDRESS_COUNTRY = /^(uk|u\.k\.|united kingdom|great britain|england|scotland|wales|northern ireland|usa|u\.s\.a\.|u\.s\.|united states|united states of america|ireland|eire|éire)$/i;
/** A street line: starts with a number, or carries a street-type / unit word. */
const STREET_WORD = /^\d|\b(st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|way|close|court|ct|unit|suite|ste|floor|fl|yard|wharf|quay|mews|row|terrace|smokehouse|arcade|building|bldg|house|no)\b/i;
// UK (SW1A 1AA), Canada (M5H 2N2), and US/AU numeric (78701, 2000, 90210-1234).
const POSTCODE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|[A-Z]\d[A-Z]\s*\d[A-Z]\d|\d{4,5}(?:-\d{4})?)\b/gi;

/**
 * REGION tokens — the county / state / province that sits between the town and
 * the postcode ("Kendal, **Cumbria** LA9 4ND"; "Austin, **TX** 78701"). These are
 * NOT the settlement and must be skipped when hunting for the town.
 *
 * Two sets, used differently:
 *  - CODES: 2-letter US-state / CA-province / AU-state abbreviations. Unambiguous
 *    as a standalone segment (a town is never "TX"), so skipped ANYWHERE.
 *  - NAMES: spelled-out states/provinces + UK counties. A few collide with real
 *    town names ("New York", "Washington", "Victoria", "Durham"), so those are
 *    deliberately OMITTED — and a NAME is only skipped when it's the token
 *    physically carrying the postcode (position-disambiguated), never elsewhere.
 */
const REGION_CODES = new Set<string>([
  // US states + DC
  "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia","ks",
  "ky","la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj","nm","ny",
  "nc","nd","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt","va","wa","wv",
  "wi","wy","dc",
  // Canadian provinces + territories
  "ab","bc","mb","nb","nl","ns","nt","nu","on","pe","qc","sk","yt",
  // Australian states + territories
  "nsw","vic","qld","sa","tas","act",
]);

const REGION_NAMES = new Set<string>([
  // US states (spelled out) — "new york" & "washington" OMITTED (real cities).
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
  "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
  "minnesota","mississippi","missouri","montana","nebraska","nevada",
  "new hampshire","new jersey","new mexico","north carolina","north dakota",
  "ohio","oklahoma","oregon","pennsylvania","rhode island","south carolina",
  "south dakota","tennessee","texas","utah","vermont","virginia","west virginia",
  "wisconsin","wyoming",
  // Canadian provinces — "victoria" OMITTED (city).
  "alberta","british columbia","manitoba","new brunswick",
  "newfoundland and labrador","nova scotia","ontario","prince edward island",
  "quebec","saskatchewan","northwest territories","nunavut","yukon",
  // Australian states/territories — "victoria" OMITTED (city).
  "new south wales","queensland","south australia","western australia","tasmania",
  "australian capital territory","northern territory",
  // England — ceremonial counties (town-name collisions like "durham" OMITTED;
  // "county durham" kept as the distinct county form).
  "bedfordshire","berkshire","buckinghamshire","cambridgeshire","cheshire",
  "cornwall","cumbria","derbyshire","devon","dorset","county durham",
  "east riding of yorkshire","east sussex","essex","gloucestershire",
  "greater london","greater manchester","hampshire","herefordshire",
  "hertfordshire","isle of wight","kent","lancashire","leicestershire",
  "lincolnshire","merseyside","norfolk","north yorkshire","northamptonshire",
  "northumberland","nottinghamshire","oxfordshire","rutland","shropshire",
  "somerset","south yorkshire","staffordshire","suffolk","surrey",
  "tyne and wear","warwickshire","west midlands","west sussex","west yorkshire",
  "wiltshire","worcestershire",
  // Wales (preserved counties) + common principal areas.
  "clwyd","dyfed","gwent","gwynedd","powys","mid glamorgan","south glamorgan",
  "west glamorgan","ceredigion","pembrokeshire","carmarthenshire","monmouthshire",
  // Scotland — common council areas / historic counties.
  "aberdeenshire","angus","argyll and bute","ayrshire","dumfries and galloway",
  "fife","highland","lanarkshire","midlothian","perthshire","renfrewshire",
  "stirlingshire","scottish borders","the scottish borders",
  // ── Non-Anglo regions (Fable M-10) — high-volume BBQ markets. Region/state/
  // province names that must not be stored as the settlement. City-name
  // collisions (e.g. a state whose name equals its capital: São Paulo, Madrid,
  // Puebla, Murcia, Bremen) are DELIBERATELY OMITTED — same rule as the UK set.
  // The QA sample is the belt-and-braces for anything not covered here.
  // Germany (Bundesländer)
  "bavaria","bayern","baden-württemberg","baden-wurttemberg","north rhine-westphalia",
  "nordrhein-westfalen","lower saxony","niedersachsen","hesse","hessen","saxony",
  "sachsen","rhineland-palatinate","rheinland-pfalz","schleswig-holstein","brandenburg",
  "saxony-anhalt","sachsen-anhalt","thuringia","thüringen","mecklenburg-vorpommern","saarland",
  // South Africa (provinces)
  "gauteng","western cape","eastern cape","northern cape","kwazulu-natal","kwazulu natal",
  "limpopo","mpumalanga","north west","free state",
  // Mexico (states — capital-colliding ones omitted)
  "jalisco","nuevo leon","nuevo león","baja california","baja california sur","quintana roo",
  "yucatan","yucatán","sonora","sinaloa","coahuila","tamaulipas","michoacan","michoacán",
  "estado de mexico","estado de méxico","chiapas","guerrero","nayarit","sinaloa",
  // Brazil (states — Rio de Janeiro / São Paulo omitted as city collisions)
  "minas gerais","bahia","parana","paraná","rio grande do sul","santa catarina","pernambuco",
  "ceara","ceará","goias","goiás","espirito santo","espírito santo","mato grosso",
  "mato grosso do sul","para","pará","amazonas","distrito federal","maranhao","maranhão",
  "rio grande do norte","paraiba","paraíba","piaui","piauí","alagoas","sergipe","tocantins","rondonia","rondônia","acre","amapa","amapá","roraima",
  // Spain (autonomous communities — Madrid / Murcia omitted as city collisions)
  "andalusia","andalucia","andalucía","catalonia","cataluña","catalunya","galicia",
  "basque country","país vasco","pais vasco","castile and leon","castilla y leon",
  "castilla y león","castile-la mancha","castilla-la mancha","valencian community",
  "comunidad valenciana","aragon","aragón","extremadura","cantabria","asturias","navarre",
  "navarra","la rioja","balearic islands","islas baleares","canary islands","islas canarias",
  // Italy (regions)
  "lombardy","lombardia","tuscany","toscana","piedmont","piemonte","veneto","emilia-romagna",
  "sicily","sicilia","sardinia","sardegna","campania","lazio","liguria","calabria","puglia",
  "apulia","marche","abruzzo","umbria","trentino-alto adige","friuli venezia giulia",
  "basilicata","molise","valle d'aosta",
  // France (régions — Paris omitted; it sits in Île-de-France anyway)
  "île-de-france","ile-de-france","auvergne-rhône-alpes","auvergne-rhone-alpes",
  "nouvelle-aquitaine","occitanie","hauts-de-france","grand est",
  "provence-alpes-côte d'azur","provence-alpes-cote d'azur","pays de la loire","normandy",
  "normandie","brittany","bretagne","bourgogne-franche-comté","bourgogne-franche-comte",
  "centre-val de loire","corsica","corse",
]);

const normToken = (v: string): string =>
  clean(v).toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();

/** A 2-letter state/province code (skippable anywhere in the address tail). */
export function looksLikeRegionCode(token: string | null | undefined): boolean {
  return REGION_CODES.has(normToken(token ?? ""));
}

/**
 * A county / state / province NAME (e.g. "Cumbria", "Texas"). Deliberately does
 * NOT match real town names that double as regions ("New York", "Durham") — so
 * it's safe to reject a stored `city` that equals one of these.
 */
export function looksLikeRegionName(token: string | null | undefined): boolean {
  return REGION_NAMES.has(normToken(token ?? ""));
}

/** Region = a 2-letter code OR a spelled-out county/state/province name. */
export function looksLikeRegion(token: string | null | undefined): boolean {
  return looksLikeRegionCode(token) || looksLikeRegionName(token);
}

/**
 * Best-effort extraction of the TOWN / locality from a full address string — the
 * locality token that sits before the region + postcode. e.g.
 * "The Old Smokehouse, Yard 2 Stricklandgate, Kendal, England LA9 4ND" → "Kendal".
 * Strips postcodes, drops trailing country/nation tokens, and skips street
 * lines, returning the last remaining non-street part (settlement-normalised).
 * Returns "" when it can't find a confident town.
 */
export function localityFromAddress(address: string | null | undefined): string {
  const raw = clean(address);
  if (!raw) return "";
  const rawParts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (rawParts.length < 2) return "";

  // Which comma-part physically carries the postcode? (the LAST such — a UK
  // county or US state name sits attached to it: "Cumbria LA9 4ND", "TX 78701").
  let pcIdx = -1;
  for (let i = rawParts.length - 1; i >= 0; i--) {
    POSTCODE.lastIndex = 0;
    if (POSTCODE.test(rawParts[i])) {
      pcIdx = i;
      break;
    }
  }

  // Strip postcodes from every part, keeping index alignment with pcIdx.
  const parts = rawParts.map((p) => p.replace(POSTCODE, "").trim());

  // The town is the LAST part that isn't a country, a region, a street line, or
  // a POI. A 2-letter CODE is skipped anywhere; a spelled-out region NAME is
  // skipped only when it's the postcode-bearing token (so "New York" the city,
  // which never carries the ZIP itself, is never mistaken for the state).
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (!p) continue;
    if (ADDRESS_COUNTRY.test(p)) continue;
    if (looksLikeRegionCode(p)) continue;
    if (i === pcIdx && looksLikeRegionName(p)) continue;
    if (STREET_WORD.test(p) || looksLikePoiCity(p)) continue;
    return settlementCity(p);
  }
  return "";
}

/** Does this town appear as a token in the full address string? The real town is
 *  almost always present in the address; an invented neighbourhood label is not. */
function cityAppearsInAddress(city: string, address: string | null | undefined): boolean {
  const target = normCity(city);
  if (!target) return false;
  const addr = clean(address);
  if (!addr) return false;
  // Exact comma-part match ("…, Houston, TX 77007" → part "Houston").
  const parts = addr.split(",").map((p) => normCity(p)).filter(Boolean);
  if (parts.includes(target)) return true;
  // Whitespace-bounded phrase match across the whole address (town folded into
  // another part).
  const hay = ` ${addr.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
  return hay.includes(` ${target} `);
}

/**
 * Resolve the CITY to a real town. A candidate is only usable if it's a genuine
 * town — never a POI/landmark, never a county/state/province ("Cumbria", "TX"),
 * and never a neighbourhood / civic-association label ("Washington Avenue
 * Coalition / Memorial Park"). We try, in order: the provided city, the town
 * parsed out of the full address, then the geocoder's settlement.
 *
 * Extra safety (the neighbourhood-overwrite bug): even when the provided city is
 * a real town, if it does NOT appear anywhere in the address while the
 * address yields a DIFFERENT real town that DOES, we trust the address-derived
 * town — the real town is almost always in the address; an invented locality is
 * not. Returns "" only when nothing usable exists (caller should then flag).
 */
export function bestSettlement(opts: {
  city?: string | null;
  address?: string | null;
  geoCity?: string | null;
}): string {
  const provided = settlementCity(opts.city);
  const fromAddress = localityFromAddress(opts.address);

  if (isRealTown(provided)) {
    if (
      isRealTown(fromAddress) &&
      normCity(fromAddress) !== normCity(provided) &&
      !cityAppearsInAddress(provided, opts.address) &&
      cityAppearsInAddress(fromAddress, opts.address)
    ) {
      return fromAddress;
    }
    return provided;
  }
  if (isRealTown(fromAddress)) return fromAddress;
  const geo = settlementCity(opts.geoCity);
  if (isRealTown(geo)) return geo;
  // Nothing resolved to a clean town — return "" so the caller flags it for a
  // human rather than storing a county/state/POI/neighbourhood as the city.
  return "";
}

/** Completeness score = count of comma-separated tokens (more parts = fuller). */
export function addressScore(addr: string | null | undefined): number {
  if (!addr) return 0;
  return clean(addr)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length;
}

/**
 * Pick the fuller of two addresses — NEVER downgrade a complete address to a
 * thinner one. Ties go to the freshly-composed one (it's the newest facts).
 */
export function preferFullerAddress(
  fresh: string | null | undefined,
  existing: string | null | undefined
): string {
  const f = clean(fresh);
  const e = clean(existing);
  if (!f) return e;
  if (!e) return f;
  return addressScore(f) >= addressScore(e) ? f : e;
}

// Street-type + directional + common non-English street-type words, each folded
// to ONE canonical token so the same road matches however it's written/accented.
const STREET_ABBR: Record<string, string> = {
  avenue: "ave", street: "st", road: "rd", boulevard: "blvd", drive: "dr",
  lane: "ln", court: "ct", place: "pl", parkway: "pkwy", highway: "hwy",
  freeway: "fwy", terrace: "ter", square: "sq", crescent: "cres",
  north: "n", south: "s", east: "e", west: "w",
  northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
  // Non-English street-type words (folded to a stable token; applied to BOTH
  // sides of every comparison, so it can only ever help a match, never split one).
  calle: "c", avenida: "av", carrera: "cra", carretera: "ctra",
  strasse: "str", rua: "r", viale: "via",
};

// A pure building-number token: digits with at most one trailing letter ("107",
// "107a"). Deliberately NOT an ordinal in a street name ("47th", "1st" carry two
// trailing letters), so those stay in the street name where they belong.
const BUILDING_NO = /^\d+[a-z]?$/;

/**
 * Normalise a STREET address to an identity key. Takes the portion before the
 * first comma (the street line — so a trailing colonia/sub-locality/city never
 * pollutes it), folds diacritics, lowercases, strips punctuation + suite/unit
 * designators, and standardises street-type abbreviations. Crucially it is
 * **number-position agnostic**: a building number may lead (US "107 Main St") or
 * trail (MX/EU "Main St 107"); both yield the SAME key. So the three Old Jimmy's
 * variants — "Plutarco Elías Calles 107", "Plutarco Elias Calles 107",
 * "107 Plutarco Elías Calles" — all normalise to one key. Empty when unusable.
 */
export function normStreet(addr: string | null | undefined): string {
  const first = foldDiacritics(clean(addr)).split(",")[0] ?? "";
  let s = first.toLowerCase();
  // Drop suite/unit/apt designators AND their number FIRST, so a suite number is
  // never mistaken for the building number when we reorder below.
  s = s.replace(/\b(suite|ste|unit|apt|apartment|no|#)\s*#?\s*[\w-]+/g, " ");
  s = s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const tokens = s.split(" ").map((w) => STREET_ABBR[w] ?? w);
  // Pull the building number(s) to the front so "107 Main St" == "Main St 107".
  const nums = tokens.filter((t) => BUILDING_NO.test(t)).sort();
  const words = tokens.filter((t) => !BUILDING_NO.test(t));
  return [...nums, ...words].join(" ").trim();
}

/**
 * Normalise a CITY / branch label to an identity key: lowercase, strip a
 * trailing US state suffix (", KS" / " KS") and country suffix, drop
 * punctuation, collapse whitespace. "Olathe, KS" and "Olathe" both → "olathe".
 */
export function normCity(city: string | null | undefined): string {
  // Fold diacritics first, so "San Pedro Garza García" == "San Pedro Garza
  // Garcia" (the Old Jimmy's city variant) instead of the accent splitting them.
  let s = foldDiacritics(clean(city)).toLowerCase();
  if (!s) return "";
  s = s
    .replace(/,?\s*(united states|usa|u\.s\.a\.|u\.s\.)\s*$/i, "")
    // Trailing 2-letter STATE code — only when it's a separate token (comma or
    // space before it), so we don't chop the last 2 letters off a city name
    // ("Fort Worth" must NOT become "Fort Wor").
    .replace(/[,\s]+[a-z]{2}\.?\s*$/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Expand common city abbreviations so "Ft. Worth" == "Fort Worth" and
  // "St. Louis" == "Saint Louis" (prevents same-city seed duplicates).
  const cityAbbr: Record<string, string> = { ft: "fort", mt: "mount", st: "saint" };
  s = s
    .split(" ")
    .map((w) => cityAbbr[w] ?? w)
    .join(" ");
  return s;
}
