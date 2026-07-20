/**
 * Grok (xAI) research client — the Atlas's "hunting" engine.
 *
 * The idea: hand Grok whatever scraps a user gives us (a name, an Instagram
 * handle, a rough address) and let it go hunting across the live web for the
 * rest — opening hours, phone, website, full address, the style of barbecue,
 * what's on the menu. Grok finds; we polish and a human approves before
 * anything is published. Nothing here writes to the database.
 *
 * Entirely gated on XAI_API_KEY. With no key, GROK_ENABLED is false and every
 * call throws a friendly, catchable error, so the rest of the app runs fine
 * with the feature simply dormant.
 *
 * xAI exposes an OpenAI-compatible Chat Completions API with "Live Search",
 * so we talk to it over plain fetch — no extra dependency.
 */

const XAI_BASE = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";
export const GROK_MODEL = process.env.XAI_MODEL ?? "grok-4";
export const GROK_ENABLED = Boolean(process.env.XAI_API_KEY);

export class GrokError extends Error {}

interface SearchParams {
  mode?: "auto" | "on" | "off";
  return_citations?: boolean;
  max_search_results?: number;
}

interface GrokJSONOptions {
  system: string;
  user: string;
  /** Live web search. Defaults to "on" so Grok actually hunts. */
  search?: SearchParams | false;
  temperature?: number;
}

interface GrokJSONResult<T> {
  data: T;
  citations: string[];
  model: string;
}

/**
 * Call Grok and parse a single JSON object back. Instructs the model to reply
 * with strict JSON; we also defensively extract the first {...} block in case
 * the model wraps it in prose.
 */
export async function grokJSON<T>({
  system,
  user,
  search = { mode: "on", return_citations: true, max_search_results: 12 },
  temperature = 0.2,
}: GrokJSONOptions): Promise<GrokJSONResult<T>> {
  if (!GROK_ENABLED) {
    throw new GrokError(
      "Grok isn't switched on — set XAI_API_KEY to enable AI enrichment."
    );
  }

  const body: Record<string, unknown> = {
    model: GROK_MODEL,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  };
  if (search) body.search_parameters = search;

  let res: Response;
  try {
    res = await fetch(`${XAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new GrokError(
      `Could not reach Grok: ${err instanceof Error ? err.message : "network error"}`
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GrokError(
      `Grok request failed (${res.status}). ${detail.slice(0, 300)}`
    );
  }

  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "";
  const citations: string[] =
    json?.citations ??
    json?.choices?.[0]?.message?.citations ??
    [];

  let parsed: T;
  try {
    parsed = JSON.parse(content) as T;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new GrokError("Grok returned a response we couldn't parse as JSON.");
    }
    parsed = JSON.parse(match[0]) as T;
  }

  return {
    data: parsed,
    citations: Array.isArray(citations) ? citations.slice(0, 20) : [],
    model: json?.model ?? GROK_MODEL,
  };
}
