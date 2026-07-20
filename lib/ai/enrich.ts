import { grokJSON } from "./grok";
import { BBQ_STYLES, STYLE_LABELS } from "@/lib/constants/styles";
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
  /** 0–1 self-reported confidence in the overall find. */
  confidence: number;
  /** Per-field notes / caveats for the human reviewer. */
  reviewer_notes: string | null;
  citations: string[];
}

const VENUE_SYSTEM = `You are a meticulous research assistant for The BBQ Atlas, a global directory of barbecue venues. You are given whatever fragments are known about a real-world barbecue business and must HUNT the live web to verify and complete the record.

Rules:
- Only report facts you can actually corroborate from the web (official site, Instagram, Google/maps listings, reputable directories, press). Never invent a phone number, address, or opening hours.
- If a field cannot be verified, return null for it rather than guessing.
- "style" MUST be one slug from this list or null: ${STYLE_LIST}.
- "offerings" MUST be a subset of these slugs (menu items you can corroborate), else []: ${OFFERING_LIST}.
- "price_level" is an integer 1–4 (1 cheap … 4 high-end) or null.
- "hours" is an object keyed by mon,tue,wed,thu,fri,sat,sun with human strings like "11:00–20:00" or "Closed", or null if unknown.
- "description" is 2–4 warm, factual sentences in The BBQ Atlas's celebratory-but-honest voice. No hype, no invented awards.
- "permanently_closed": true only if you find clear evidence the business has closed for good; else false or null.
- "confidence" is your honest 0–1 estimate that this record is correct and about the right business.
- "reviewer_notes": briefly flag anything uncertain, ambiguous, or that a human should double-check.

Respond ONLY with a JSON object with exactly these keys: name, description, website, phone, address, city, country, style, offerings, price_level, hours, permanently_closed, confidence, reviewer_notes.`;

export async function enrichVenue(lead: VenueLead): Promise<EnrichedVenue> {
  const known = Object.entries(lead)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const user = `Here is what we know about a barbecue venue. Hunt the web and return the most complete, verified record you can.

Known so far:
${known || "- (almost nothing — start from the name/handle above)"}

Return the JSON object described in your instructions.`;

  const { data, citations } = await grokJSON<Partial<EnrichedVenue>>({
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
    confidence,
    reviewer_notes: data.reviewer_notes ?? null,
    citations,
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
