import { grokJSON } from "./grok";
import { claudeJSON, CLAUDE_ENABLED } from "./claude";
import { BBQ_STYLES, STYLE_LABELS } from "@/lib/constants/styles";

export type Engine = "grok" | "claude";

/** Route a JSON hunt to the chosen engine (same prompt, independent opinions). */
function runEngine<T>(
  engine: Engine,
  opts: { system: string; user: string; search?: boolean; temperature?: number }
) {
  return engine === "claude" ? claudeJSON<T>(opts) : grokJSON<T>(opts);
}
import { OFFERINGS } from "@/lib/constants/offerings";
import type { BbqStyle } from "@/lib/constants/styles";

/**
 * Higher-level enrichment tasks built on the Grok client. Each returns a
 * best-effort, structured result plus a self-reported confidence and the
 * sources Grok used. Callers treat the output as a *draft* for human review —
 * never as ground truth to publish blindly.
 */

const STYLE_LIST = BBQ_STYLES.map((s) => `${s} (${STYLE_LABELS[s]})`).join(", ");
const OFFERING_SLUGS = OFFERINGS.map((o) => o.slug);
const OFFERING_LIST = OFFERINGS.map((o) => `${o.slug} (${o.label})`).join(", ");

export interface VenueLead {
  name?: string;
  instagram?: string;
  website?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  notes?: string;
}

export interface EnrichedVenue {
  name: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  style: BbqStyle | null;
  offerings: string[];
  price_level: number | null;
  hours: Record<string, string> | null;
  permanently_closed: boolean | null;
  instagram_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  /** If part of a multi-location chain, the brand + this branch's label. */
  brand_name: string | null;
  location_label: string | null;
  is_multi_location: boolean;
  /** Up to 3 recent PUBLIC Instagram post permalinks for on-page embeds. */
  instagram_posts: string[];
  /** 0–1 self-reported confidence in the overall find. */
  confidence: number;
  /** Per-field notes / caveats for the human reviewer. */
  reviewer_notes: string | null;
  citations: string[];
}

const VENUE_SYSTEM = `You are a meticulous research assistant for The BBQ Atlas, a global directory of barbecue venues. You are given whatever fragments are known about a real-world barbecue business and must HUNT the live web to verify and complete the record.

Where to look (be aggressive and exhaustive across ALL of these):
- START with the venue's own website (if given) and its Instagram — most of our venues live on Instagram.
- THEN aggressively check X/Twitter, Facebook, Threads, TikTok, YouTube and any other social profiles you can find, plus the venue's own site, official menus, reservation pages, and reputable local press or food directories.
- Cross-reference across several of these to confirm each fact.
- You MAY use general web search (including Google as a search engine) to DISCOVER the venue's own website and social profiles. But do NOT extract, copy, or rely on structured listing data from Google Maps or a Google business/knowledge-panel listing — get the actual facts (hours, phone, address) from the venue's own site and social channels. Never cite Google Maps as a source.
- Capture the venue's social profile URLs when you find them: instagram_url, x_url (X/Twitter), facebook_url, tiktok_url, youtube_url. Use full https URLs, or null if not found.
- "instagram_posts": up to 3 permalink URLs of recent PUBLIC Instagram posts from this venue (e.g. https://www.instagram.com/p/XXXX/), for embedding photos on their page. [] if none found.

Rules:
- Only report facts you can actually corroborate from the venue's own site, Instagram, X, Facebook, other socials, or press. Never invent a phone number, address, or opening hours.
- If a field cannot be verified, return null for it rather than guessing.
- "style" MUST be one slug from this list or null: ${STYLE_LIST}.
- "offerings" MUST be a subset of these slugs (menu items you can corroborate), else []: ${OFFERING_LIST}.
- "price_level" is an integer 1–4 (1 cheap … 4 high-end) or null.
- "hours" is an object keyed by mon,tue,wed,thu,fri,sat,sun with human strings like "11:00–20:00" or "Closed", or null if unknown.
- "description" is 2–4 warm, factual sentences in The BBQ Atlas's celebratory-but-honest voice. No hype, no invented awards.
- "permanently_closed": true only if you find clear evidence the business has closed for good; else false or null.
- "confidence" is your honest 0–1 estimate that this record is correct and about the right business.
- Multi-location chains: set "is_multi_location" true if this business has more than one physical venue. Put the overall brand name in "brand_name" (e.g. "Third Wave BBQ") and this specific branch's short label in "location_label" (e.g. "Albert Park"). Base address/hours/phone on the SPECIFIC location given, or the flagship if unspecified, and list the other known locations in reviewer_notes. If it's a single independent venue, set is_multi_location false and brand_name/location_label null.
- "reviewer_notes": briefly flag anything uncertain, ambiguous, the other locations of a chain, or that a human should double-check.

Respond ONLY with a JSON object with exactly these keys: name, description, website, phone, address, city, country, style, offerings, price_level, hours, permanently_closed, instagram_url, x_url, facebook_url, tiktok_url, youtube_url, instagram_posts, brand_name, location_label, is_multi_location, confidence, reviewer_notes.`;

export async function enrichVenue(
  lead: VenueLead,
  engine: Engine = "grok"
): Promise<EnrichedVenue> {
  const known = Object.entries(lead)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const user = `Here is what we know about a barbecue venue. Hunt the web and return the most complete, verified record you can.

Known so far:
${known || "- (almost nothing — start from the name/handle above)"}

Return the JSON object described in your instructions.`;

  const { data, citations } = await runEngine<Partial<EnrichedVenue>>(engine, {
    system: VENUE_SYSTEM,
    user,
  });

  // Defensive normalisation — never trust the model's shape blindly.
  const style =
    data.style && (BBQ_STYLES as string[]).includes(data.style)
      ? (data.style as BbqStyle)
      : null;
  const offerings = Array.isArray(data.offerings)
    ? data.offerings.filter((s) => OFFERING_SLUGS.includes(s))
    : [];
  const price =
    typeof data.price_level === "number" &&
    data.price_level >= 1 &&
    data.price_level <= 4
      ? Math.round(data.price_level)
      : null;
  const confidence =
    typeof data.confidence === "number"
      ? Math.max(0, Math.min(1, data.confidence))
      : 0;

  return {
    name: data.name ?? lead.name ?? null,
    description: data.description ?? null,
    website: data.website ?? lead.website ?? null,
    phone: data.phone ?? lead.phone ?? null,
    address: data.address ?? lead.address ?? null,
    city: data.city ?? lead.city ?? null,
    country: data.country ?? lead.country ?? null,
    style,
    offerings,
    price_level: price,
    hours:
      data.hours && typeof data.hours === "object"
        ? (data.hours as Record<string, string>)
        : null,
    permanently_closed:
      typeof data.permanently_closed === "boolean"
        ? data.permanently_closed
        : null,
    instagram_url: data.instagram_url ?? null,
    x_url: data.x_url ?? null,
    facebook_url: data.facebook_url ?? null,
    tiktok_url: data.tiktok_url ?? null,
    youtube_url: data.youtube_url ?? null,
    brand_name: data.brand_name ?? null,
    location_label: data.location_label ?? null,
    is_multi_location:
      typeof data.is_multi_location === "boolean" ? data.is_multi_location : false,
    instagram_posts: Array.isArray(data.instagram_posts)
      ? data.instagram_posts
          .filter((u) => typeof u === "string" && /instagram\.com\/(p|reel)\//.test(u))
          .slice(0, 3)
      : [],
    confidence,
    reviewer_notes: data.reviewer_notes ?? null,
    citations,
  };
}

// ===========================================================================
// Enrichment v3 — Grok RESEARCHES a strict facts-only dossier; Claude WRITES the
// house-voice copy from it. (ENRICHMENT-SPEC.md). One writer = one voice; Grok
// never produces marketing copy, Claude never invents facts.
// ===========================================================================

/** Grok's structured, facts-only research output for ONE venue. */
export interface VenueDossier {
  name: string | null;
  also_known_as: string[];
  what_it_is: string | null;
  address: string | null;
  city: string | null;
  region_state: string | null;
  country: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  other_socials: string[];
  hours: Record<string, string> | null;
  established: string | null;
  founders_pitmaster: string | null;
  bbq_style: string | null;
  specialities: string[];
  cook_method: string | null;
  wood_fuel: string | null;
  price_band: string | null;
  awards_press: string[];
  setting_vibe: string | null;
  ordering_notes: string | null;
  best_photo_post_url: string | null;
  sources: string[];
  unknowns: string[];
}

const DOSSIER_SYSTEM = `You are a RELENTLESS barbecue researcher for The BBQ Atlas, with live web-search and browsing tools. Research ONE venue and return a strict, FACTS-ONLY dossier. You are the researcher, not the writer — produce NO marketing or descriptive copy.

Use every tool aggressively and exhaustively — do NOT stop at the first source. Lead with the venue's OWN primary sources, in this order of preference:
- the venue's official WEBSITE (about, menu, hours, story) — the source of truth;
- their INSTAGRAM + other official socials (bio, linked site, recent posts);
- local NEWS, press, food blogs and city guides (history, awards, pitmaster profiles);
- YOUTUBE (pitmaster interviews often reveal wood, method and backstory nothing else does);
- Google Business / Maps and review platforms (Google / Yelp / TripAdvisor) — use ONLY as a light CROSS-CHECK of the plain facts (address, coordinates, phone, opening hours). Do NOT copy their review text, editorial descriptions, or photos, and never cite Google Maps as a source.

Prefer PRIMARY sources; corroborate each non-obvious fact across at least two sources where possible. Keep searching until every field below is either filled from a real source or genuinely unavailable — treat empty fields as unfinished work, not a stopping point. Follow links; open pages; don't guess from a snippet.

COPYRIGHT / SOURCING RULE: collect FACTS ONLY (facts aren't copyrightable). NEVER reproduce third-party expressive content — no review text, no editorial blurbs, no photos — from Google or anywhere. Do not scrape any site en masse. The dossier is raw facts + source URLs; all published copy is written fresh by us later.

For anything you cannot verify, use null (or [] for lists) and list the field name under "unknowns" — NEVER guess or invent. Put a source URL for each non-obvious fact in "sources".

Field notes:
- "what_it_is": ONE factual line (e.g. "Central Texas barbecue joint and butcher shop"). Not a description.
- "hours": an object keyed mon,tue,wed,thu,fri,sat,sun with strings like "11:00-20:00" or "Closed", or null. Note "sells out early"/variable in "ordering_notes".
- "bbq_style": the real-world style in plain words (e.g. "Central Texas", "Carolina", "Kansas City", "asado", "Korean", "braai").
- "price_band": one of £, ££, £££, ££££ or null.
- "instagram": the venue's official Instagram profile URL. "other_socials": full https URLs for X/Twitter, Facebook, TikTok, YouTube, etc.
- "best_photo_post_url": a single strong PUBLIC Instagram POST or REEL permalink (https://www.instagram.com/p/... or /reel/...) that would make a good hero image, or null.
- "lat"/"lng": decimal coordinates if you can verify them, else null.

Respond ONLY with a JSON object with exactly these keys: name, also_known_as, what_it_is, address, city, region_state, country, postcode, lat, lng, phone, website, instagram, other_socials, hours, established, founders_pitmaster, bbq_style, specialities, cook_method, wood_fuel, price_band, awards_press, setting_vibe, ordering_notes, best_photo_post_url, sources, unknowns.`;

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : [];
const asStr = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const asNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Grok research leg: one venue → one strict, facts-only dossier. */
export async function researchDossier(
  lead: VenueLead,
  engine: Engine = "grok"
): Promise<{ dossier: VenueDossier; citations: string[] }> {
  const known = Object.entries(lead)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const user = `Research this ONE barbecue venue and return the facts-only JSON dossier.

Known so far:
${known || "- (almost nothing — start from the name/handle above)"}

Return ONLY the dossier JSON described in your instructions. Facts only — no descriptive or marketing copy.`;

  const { data, citations } = await runEngine<Partial<VenueDossier>>(engine, {
    system: DOSSIER_SYSTEM,
    user,
  });

  const hours =
    data.hours && typeof data.hours === "object" && !Array.isArray(data.hours)
      ? (data.hours as Record<string, string>)
      : null;

  const dossier: VenueDossier = {
    name: asStr(data.name) ?? lead.name ?? null,
    also_known_as: asArray(data.also_known_as),
    what_it_is: asStr(data.what_it_is),
    address: asStr(data.address) ?? lead.address ?? null,
    city: asStr(data.city) ?? lead.city ?? null,
    region_state: asStr(data.region_state),
    country: asStr(data.country) ?? lead.country ?? null,
    postcode: asStr(data.postcode),
    lat: asNum(data.lat),
    lng: asNum(data.lng),
    phone: asStr(data.phone) ?? lead.phone ?? null,
    website: asStr(data.website) ?? lead.website ?? null,
    instagram: asStr(data.instagram) ?? lead.instagram ?? null,
    other_socials: asArray(data.other_socials),
    hours,
    established: asStr(data.established),
    founders_pitmaster: asStr(data.founders_pitmaster),
    bbq_style: asStr(data.bbq_style),
    specialities: asArray(data.specialities),
    cook_method: asStr(data.cook_method),
    wood_fuel: asStr(data.wood_fuel),
    price_band: asStr(data.price_band),
    awards_press: asArray(data.awards_press),
    setting_vibe: asStr(data.setting_vibe),
    ordering_notes: asStr(data.ordering_notes),
    best_photo_post_url:
      asStr(data.best_photo_post_url) &&
      /instagram\.com\/(p|reel)\//.test(String(data.best_photo_post_url))
        ? String(data.best_photo_post_url)
        : null,
    sources: asArray(data.sources),
    unknowns: asArray(data.unknowns),
  };
  return { dossier, citations };
}

export interface VenueCopy {
  hook: string | null;
  description: string | null;
  style: BbqStyle | null;
  needs_attention: boolean;
  attention_reason: string | null;
}

const COPY_SYSTEM = `You are the SINGLE house writer for The BBQ Atlas. One writer, one voice, across the whole site: dry, warm, certain, a little absurd — Ron Swanson by way of a pitmaster. We CELEBRATE barbecue; we do NOT rank it. No hype, no clichés, no exclamation-mark energy.

You are given a VERIFIED FACTS DOSSIER about one venue. Write the on-site copy using ONLY those facts.

HARD RULES:
- Never invent. If a fact is missing or listed in "unknowns", write around it — do not fill gaps with fiction.
- No star ratings, scores, "best/top/#1" claims, or invented awards.
- Do not reproduce any third-party text — write everything fresh.
- Keep it specific to THIS place using the dossier's real details (style, wood, method, specialities, setting, backstory). Generic filler is a failure.

Produce JSON with exactly these keys:
- "hook": one line in house voice (a single sentence, no rating).
- "description": 2-3 SHORT paragraphs; every fact accurate; personality carries it. Plain text (use \\n\\n between paragraphs).
- "style": the ONE slug from this list that best matches the dossier's bbq_style, or null: ${STYLE_LIST}.
- "needs_attention": true ONLY if the dossier is too thin to write an honest, specific page (mostly unknowns; no what_it_is, website or instagram; nothing concrete to say). Prefer a lean true page over a padded invented one.
- "attention_reason": if needs_attention is true, one short line on what's missing; else null.

Respond ONLY with that JSON object.`;

/** Claude writing leg: dossier → house-voice copy (falls back to Grok if Claude is off). */
export async function writeVenueCopy(dossier: VenueDossier): Promise<VenueCopy> {
  const engine: Engine = CLAUDE_ENABLED ? "claude" : "grok";
  const user = `Write the on-site copy for this venue from its verified dossier. Facts only; write around any "unknowns".

DOSSIER:
${JSON.stringify(dossier, null, 2)}

Return ONLY the JSON object described in your instructions.`;

  const { data } = await runEngine<Partial<VenueCopy>>(engine, {
    system: COPY_SYSTEM,
    user,
    search: false,
  });

  const style =
    data.style && (BBQ_STYLES as string[]).includes(data.style)
      ? (data.style as BbqStyle)
      : null;
  const description = asStr(data.description);
  // Belt-and-braces: if the writer produced nothing usable, that's needs-attention.
  const thin =
    !dossier.what_it_is && !dossier.website && !dossier.instagram && !description;
  const needs_attention =
    (typeof data.needs_attention === "boolean" ? data.needs_attention : false) ||
    thin;

  return {
    hook: asStr(data.hook),
    description,
    style,
    needs_attention,
    attention_reason: needs_attention
      ? asStr(data.attention_reason) ?? "Dossier too thin to write an honest page."
      : null,
  };
}

/** £/££/£££/££££ → 1–4 (or null). */
export function priceBandToLevel(band: string | null): number | null {
  if (!band) return null;
  const n = (band.match(/£/g) || []).length;
  return n >= 1 && n <= 4 ? n : null;
}

/** Sort a venue's other-social URLs into our per-network columns. */
export function mapSocials(urls: string[]): {
  x_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
} {
  const find = (re: RegExp) => urls.find((u) => re.test(u)) ?? null;
  return {
    x_url: find(/(twitter\.com|x\.com)\//i),
    facebook_url: find(/facebook\.com\//i),
    tiktok_url: find(/tiktok\.com\//i),
    youtube_url: find(/youtube\.com|youtu\.be/i),
  };
}

export interface NewsDraft {
  title: string;
  excerpt: string;
  content_md: string;
  category: "news" | "missive";
  citations: string[];
  reviewer_notes: string | null;
}

const NEWS_SYSTEM = `You are a staff writer for The BBQ Atlas. You research and draft short pieces for the "News & Missives" section. "news" = factual dispatches (openings, festivals, trends, industry moves). "missive" = the Atlas's own reflective voice on craft and culture.

Rules:
- For "news", HUNT the live web and base every claim on real, current, corroborated sources. Do not fabricate quotes, dates, names, or events.
- For "missive", you may write reflectively, but stay truthful and never invent facts, awards, or attributed quotes.
- Voice: warm, literate, celebratory-but-honest. We celebrate barbecue; we don't rank or hype.
- "content_md" is GitHub-flavoured Markdown, ~300–600 words, using ## / ### subheads. No front-matter, no title line (the title is separate).
- "excerpt" is one enticing sentence (max ~160 chars).
- "reviewer_notes": flag anything a human editor must verify before publishing.

Respond ONLY with a JSON object with keys: title, excerpt, content_md, category, reviewer_notes.`;

export async function researchNews(
  topic: string,
  category: "news" | "missive"
): Promise<NewsDraft> {
  const user = `Write a ${category} piece for The BBQ Atlas on this topic:

"${topic}"

${
  category === "news"
    ? "Research the live web first and ground it in current, verifiable facts."
    : "Write it as a reflective missive in the Atlas's own voice."
}

Return the JSON object described in your instructions.`;

  const { data, citations } = await grokJSON<Partial<NewsDraft>>({
    system: NEWS_SYSTEM,
    user,
    search: true,
    temperature: category === "missive" ? 0.7 : 0.35,
  });

  return {
    title: data.title ?? topic,
    excerpt: data.excerpt ?? "",
    content_md: data.content_md ?? "",
    category: data.category === "missive" ? "missive" : "news",
    citations,
    reviewer_notes: data.reviewer_notes ?? null,
  };
}

export interface ChainLocation {
  name: string | null;
  location_label: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  hours: Record<string, string> | null;
  // A location's own Instagram handle when it runs one distinct from the
  // brand's (null → inherits the brand's). Kept to a single cheap field so
  // discovery stays fast; full per-location socials/photos are best filled by
  // running single-venue enrichment on the created location afterwards.
  instagram_url: string | null;
}

export interface ChainResult {
  is_chain: boolean;
  brand_name: string | null;
  description: string | null;
  website: string | null;
  style: BbqStyle | null;
  instagram_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  locations: ChainLocation[];
  confidence: number;
  reviewer_notes: string | null;
  citations: string[];
}

const CHAIN_SYSTEM = `You are a meticulous research assistant for The BBQ Atlas. Given fragments about a barbecue business, determine whether it is a MULTI-LOCATION chain and, if so, HUNT the live web to find EVERY physical location it operates.

Where to look: start with the business's own website (often has a "Locations" page) and Instagram, then aggressively check X/Twitter, Facebook, TikTok, YouTube and reputable press. You MAY use general web search to discover their own pages, but NEVER use Google Maps or a Google listing as a source, and never copy Google's content.

Be efficient and concise — your JSON answer must be complete and well-formed, so don't pad it.

Rules:
- "is_chain": true only if there is genuinely more than one physical venue.
- For EACH location, give: name (usually the brand + area), location_label (short branch label like "Albert Park"), address, city, country, phone, hours (keyed mon..sun or null), and instagram_url ONLY if that specific branch runs its own Instagram distinct from the brand's (else null → it inherits the brand's). Only include locations you can actually corroborate. Never invent an address.
- Brand-level fields (description, website, style, socials) describe the whole brand. "style" MUST be one slug from: ${STYLE_LIST} or null.
- "confidence" 0–1 that the location list is correct and complete.
- "reviewer_notes": flag any location you're unsure about or that needs checking.

Respond ONLY with a JSON object with keys: is_chain, brand_name, description, website, style, instagram_url, x_url, facebook_url, tiktok_url, youtube_url, locations, confidence, reviewer_notes. "locations" is an array of {name, location_label, address, city, country, phone, hours, instagram_url}.`;

export async function discoverChain(lead: VenueLead): Promise<ChainResult> {
  const known = Object.entries(lead)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const user = `Here is what we know about a barbecue business. Determine if it's a multi-location chain and, if so, find ALL of its locations.

Known so far:
${known || "- (start from the name/handle above)"}

Return the JSON object described in your instructions.`;

  const { data, citations } = await grokJSON<Partial<ChainResult>>({
    system: CHAIN_SYSTEM,
    user,
  });

  const style =
    data.style && (BBQ_STYLES as string[]).includes(data.style)
      ? (data.style as BbqStyle)
      : null;
  const locations = Array.isArray(data.locations)
    ? data.locations.map((l) => ({
        name: l?.name ?? null,
        location_label: l?.location_label ?? null,
        address: l?.address ?? null,
        city: l?.city ?? null,
        country: l?.country ?? null,
        phone: l?.phone ?? null,
        hours:
          l?.hours && typeof l.hours === "object"
            ? (l.hours as Record<string, string>)
            : null,
        instagram_url: l?.instagram_url ?? null,
      }))
    : [];

  return {
    is_chain: typeof data.is_chain === "boolean" ? data.is_chain : locations.length > 1,
    brand_name: data.brand_name ?? null,
    description: data.description ?? null,
    website: data.website ?? null,
    style,
    instagram_url: data.instagram_url ?? null,
    x_url: data.x_url ?? null,
    facebook_url: data.facebook_url ?? null,
    tiktok_url: data.tiktok_url ?? null,
    youtube_url: data.youtube_url ?? null,
    locations,
    confidence:
      typeof data.confidence === "number"
        ? Math.max(0, Math.min(1, data.confidence))
        : 0,
    reviewer_notes: data.reviewer_notes ?? null,
    citations,
  };
}
