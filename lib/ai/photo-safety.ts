/**
 * Photo safety screen (Prompt 4). A single xAI (Grok) vision call that looks at a
 * user-uploaded venue photo and returns a structured safety verdict. This is an
 * ASSIST for the human moderator and a weekly re-sweep signal — it NEVER auto-
 * publishes or auto-rejects. Photos remain `pending` until a person approves.
 *
 * Gated on XAI_API_KEY (GROK_ENABLED). With no key the check is dormant and callers
 * record safety_status='unchecked'. Uses xAI's OpenAI-compatible /chat/completions
 * with an image content part (the Responses client in ./grok.ts only does text +
 * web-search image understanding, so this is a separate, image-input call shape).
 */

import { tryParseModelJson } from "./json";

const XAI_BASE = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";
export const PHOTO_SAFETY_ENABLED = Boolean(process.env.XAI_API_KEY);
// Vision-capable model. Defaults to the app's Grok model (the grok-4 family reads
// images); override with XAI_VISION_MODEL if a dedicated vision model is preferred.
export const PHOTO_SAFETY_MODEL =
  process.env.XAI_VISION_MODEL ?? process.env.XAI_MODEL ?? "grok-4-fast";

export class PhotoSafetyError extends Error {}

/** The categories a photo can be flagged under. 'none' = looks fine. */
export const SAFETY_CATEGORIES = [
  "csam",
  "sexual",
  "nudity",
  "violence",
  "gore",
  "weapons",
  "hate",
  "drugs",
  "none",
] as const;
export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];

/** Categories that always force a flag regardless of the model's own unsafe flag. */
const ALWAYS_FLAG = new Set<SafetyCategory>(["csam", "sexual", "nudity", "gore"]);

export type SafetyStatus = "pass" | "flag";

export interface SafetyVerdict {
  status: SafetyStatus;
  /** A short label for the queue — the most salient category, or 'ok'. */
  label: string;
  /** 0..1 confidence that the image is UNSAFE. */
  score: number;
  reason: string;
  categories: SafetyCategory[];
}

function clamp01(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Normalise a raw model JSON verdict into a SafetyVerdict. Pure + defensive so it's
 * unit-testable and can't throw on a weird payload. Fails SAFE: if the model says
 * unsafe, or names any always-flag category, or the shape is unusable but non-empty,
 * we flag for human review rather than passing silently.
 */
export function classifyPhotoSafety(raw: unknown): SafetyVerdict {
  const r = (raw ?? {}) as {
    unsafe?: unknown;
    categories?: unknown;
    confidence?: unknown;
    reason?: unknown;
  };

  const cats: SafetyCategory[] = Array.isArray(r.categories)
    ? (r.categories
        .map((c) => String(c).toLowerCase().trim())
        .filter((c): c is SafetyCategory => (SAFETY_CATEGORIES as readonly string[]).includes(c))
        .filter((c) => c !== "none"))
    : [];

  const modelUnsafe = r.unsafe === true || r.unsafe === "true";
  const forced = cats.some((c) => ALWAYS_FLAG.has(c));
  const status: SafetyStatus = modelUnsafe || forced ? "flag" : "pass";

  const score = clamp01(r.confidence);
  const reason = typeof r.reason === "string" ? r.reason.slice(0, 500) : "";
  const label = status === "flag" ? (cats[0] ?? "flagged") : "ok";

  return { status, label, score, reason, categories: cats };
}

export interface SafetyCheckResult {
  verdict: SafetyVerdict;
  model: string;
  usage: { in_tokens: number; out_tokens: number; searches: number };
  raw: unknown;
}

const SYSTEM =
  "You are a strict content-safety reviewer for a family-friendly barbecue restaurant " +
  "directory. You are shown ONE user-uploaded photo meant to depict food, a venue, or " +
  "its surroundings. Decide whether it is safe to show publicly. Reply with ONLY a JSON " +
  'object: {"unsafe": boolean, "categories": string[], "confidence": number, "reason": ' +
  'string}. categories must be a subset of ["csam","sexual","nudity","violence","gore",' +
  '"weapons","hate","drugs","none"]. Use "none" when the image is fine. confidence is 0..1 ' +
  "that the image is unsafe. Be conservative: normal food, people dining, restaurant " +
  "interiors, grills and smoke are SAFE. Flag sexual content, nudity, graphic violence or " +
  "gore, hateful symbols, or anything involving minors in an unsafe context.";

const USER = "Assess this photo for public display on the venue page. Return the JSON verdict only.";

/**
 * Run the vision safety check on one image URL. Throws PhotoSafetyError on any
 * network/parse failure so the caller can record safety_status='error' (still pending,
 * human reviews). Never returns a "pass" it didn't actually get from the model.
 */
export async function checkImageSafety(imageUrl: string): Promise<SafetyCheckResult> {
  if (!PHOTO_SAFETY_ENABLED) {
    throw new PhotoSafetyError("Photo safety is off — set XAI_API_KEY to enable it.");
  }
  if (!/^https:\/\//i.test(imageUrl)) {
    throw new PhotoSafetyError("Image URL must be https.");
  }

  const body = {
    model: PHOTO_SAFETY_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: USER },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(`${XAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new PhotoSafetyError("Safety check timed out.");
    }
    throw new PhotoSafetyError(
      `Could not reach the safety model: ${err instanceof Error ? err.message : "network error"}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new PhotoSafetyError(`Safety check failed (${res.status}). ${detail.slice(0, 200)}`);
  }

  let json: {
    model?: string;
    usage?: Record<string, number>;
    choices?: Array<{ message?: { content?: string } }>;
  };
  try {
    json = await res.json();
  } catch {
    throw new PhotoSafetyError("Safety model returned an unreadable response.");
  }

  const content = json.choices?.[0]?.message?.content ?? "";
  const parsed = tryParseModelJson<unknown>(content);
  if (parsed === null) {
    throw new PhotoSafetyError("Safety model returned malformed JSON.");
  }

  const u = json.usage ?? {};
  return {
    verdict: classifyPhotoSafety(parsed),
    model: json.model ?? PHOTO_SAFETY_MODEL,
    usage: {
      in_tokens: Number(u.prompt_tokens ?? u.input_tokens ?? 0) || 0,
      out_tokens: Number(u.completion_tokens ?? u.output_tokens ?? 0) || 0,
      searches: 0,
    },
    raw: parsed,
  };
}
