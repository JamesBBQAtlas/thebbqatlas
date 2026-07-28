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
 * Uses xAI's Responses API (/v1/responses) with server-side "agent tools"
 * (web_search + x_search). This replaces the old Chat-Completions
 * `search_parameters` / "Live Search", which xAI has deprecated (HTTP 410).
 */

const XAI_BASE = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";
// Cost-efficient default (COST-EFFICIENT-ENRICHMENT): grok-4-fast keeps a bounded
// per-venue research call cheap (~$0.02). Override with XAI_MODEL if needed.
export const GROK_MODEL = process.env.XAI_MODEL ?? "grok-4-fast";
export const GROK_ENABLED = Boolean(process.env.XAI_API_KEY);

export class GrokError extends Error {}

interface GrokJSONOptions {
  system: string;
  user: string;
  /** Give Grok live web/X search tools so it can actually hunt. */
  search?: boolean;
  temperature?: number;
  /** Cap web-search RESULTS per query (cost cap). */
  maxSearchResults?: number;
  /** HARD cap on the NUMBER of web searches (tool uses) — the real guarantee. */
  maxSearches?: number;
  /** Include the (extra) X search tool. Default true; pass false to bound cost. */
  xSearch?: boolean;
}

interface GrokJSONResult<T> {
  data: T;
  citations: string[];
  model: string;
  usage: { in_tokens: number; out_tokens: number; searches: number };
}

/** Best-effort usage extraction from a Responses API payload. */
function extractUsage(json: unknown): { in_tokens: number; out_tokens: number; searches: number } {
  const j = json as {
    usage?: Record<string, number>;
    output?: Array<{ type?: string }>;
  };
  const u = j.usage ?? {};
  const in_tokens = Number(u.input_tokens ?? u.prompt_tokens ?? 0) || 0;
  const out_tokens = Number(u.output_tokens ?? u.completion_tokens ?? 0) || 0;
  // Search count = number of actual web_search CALLS, not sources returned
  // (§09.2.9). One call can return several sources, so billing off
  // `num_sources_used` over-counts — a single capped call reading 4 sources read
  // as "4 searches / $0.02", making the hard-3 cap look like it leaked. Prefer
  // counting the search tool-call items in the output stream (the real,
  // cap-bounded call count); fall back to usage call-count fields only when the
  // stream has no items, with num_sources_used as the last resort.
  let searches = 0;
  if (Array.isArray(j.output)) {
    searches = j.output.filter((o) => /search/i.test(String(o?.type ?? ""))).length;
  }
  if (!searches) {
    searches = Number(u.num_searches ?? u.server_side_tool_use ?? u.num_sources_used ?? 0) || 0;
  }
  return { in_tokens, out_tokens, searches };
}

/** Pull the assistant's final text out of a Responses API payload. */
function extractText(json: unknown): string {
  const j = json as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  if (typeof j.output_text === "string" && j.output_text) return j.output_text;
  let text = "";
  for (const item of j.output ?? []) {
    if (item?.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c?.type === "output_text" && typeof c.text === "string") text += c.text;
    }
  }
  return text;
}

/**
 * Call Grok and parse a single JSON object back. Instructs the model (via the
 * caller's prompt) to reply with strict JSON; we strip inline citation markers
 * (`[[1]](url)`) the search tools inject, then defensively extract the first
 * {...} block in case the model wraps it in prose.
 */
export async function grokJSON<T>({
  system,
  user,
  search = true,
  temperature = 0.2,
  maxSearchResults,
  maxSearches,
  xSearch = true,
}: GrokJSONOptions): Promise<GrokJSONResult<T>> {
  if (!GROK_ENABLED) {
    throw new GrokError(
      "Grok isn't switched on — set XAI_API_KEY to enable AI enrichment."
    );
  }

  const body: Record<string, unknown> = {
    model: GROK_MODEL,
    instructions: system,
    input: user,
    temperature,
  };
  if (search) {
    // Atlas policy: hunt aggressively across the open web + socials. Using
    // Google as a general search engine to DISCOVER a venue's own site/socials
    // is fine — but we never lift structured listing data from Google MAPS, so
    // there's no question of having copied it. We block the Maps domains at the
    // API level and reinforce "no Maps content" in the prompt. Image
    // understanding lets Grok read details (hours, menus) off social images.
    const webSearch: Record<string, unknown> = {
      type: "web_search",
      filters: {
        excluded_domains: ["maps.google.com", "maps.app.goo.gl", "goo.gl"],
      },
      // Read details (hours, menus) straight off social post images.
      enable_image_understanding: true,
    };
    // Bound the search breadth for a cheap, single-pass call (cost cap).
    if (typeof maxSearchResults === "number") {
      webSearch.max_search_results = maxSearchResults;
    }
    // HARD cap on the number of searches — stop the tool loop after N (§09.1.4).
    if (typeof maxSearches === "number") {
      webSearch.max_uses = maxSearches;
    }
    body.tools = xSearch ? [webSearch, { type: "x_search" }] : [webSearch];
    // Belt-and-braces: cap total tool iterations at the request level too.
    if (typeof maxSearches === "number") {
      body.max_tool_calls = maxSearches;
    }
  }

  // Safety net well inside the (Pro) 300s function limit — a stuck hunt surfaces
  // a clear "took too long" rather than consuming the whole budget.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  let res: Response;
  try {
    res = await fetch(`${XAI_BASE}/responses`, {
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
      throw new GrokError("Grok took too long and timed out — please try again.");
    }
    throw new GrokError(
      `Could not reach Grok: ${err instanceof Error ? err.message : "network error"}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GrokError(
      `Grok request failed (${res.status}). ${detail.slice(0, 300)}`
    );
  }

  let json: { citations?: unknown; model?: string };
  try {
    json = await res.json();
  } catch {
    throw new GrokError("Grok returned an unreadable response — please try again.");
  }
  const citations: string[] = Array.isArray(json?.citations) ? json.citations : [];

  const raw = extractText(json);
  // Strip inline citation markers like [[1]](https://…) the tools inject.
  const cleaned = raw.replace(/\[\[\d+\]\]\([^)]*\)/g, "").trim();

  let parsed: T;
  try {
    parsed = JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new GrokError("Grok returned a response we couldn't parse as JSON.");
    }
    try {
      parsed = JSON.parse(match[0]) as T;
    } catch {
      throw new GrokError(
        "Grok returned malformed JSON (its answer was likely cut off). Try again, or narrow the search with a city."
      );
    }
  }

  return {
    data: parsed,
    citations: citations.slice(0, 20),
    model: json?.model ?? GROK_MODEL,
    usage: extractUsage(json),
  };
}
