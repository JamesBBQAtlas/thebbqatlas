/**
 * Claude (Anthropic) research client — the second independent opinion.
 *
 * Runs the same hunting task as Grok so the two can be compared. Gated entirely
 * on ANTHROPIC_API_KEY: with no key, CLAUDE_ENABLED is false and self-healing
 * quietly falls back to Grok-only. Uses Anthropic's server-side web search tool
 * so Claude genuinely hunts the live web rather than guessing.
 */

const ANTHROPIC_BASE = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1";
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
// The house-voice WRITING step runs on Haiku by default — lean + cheap (~$0.004
// per venue), isolated from the research leg (COST-EFFICIENT-ENRICHMENT §3).
export const CLAUDE_WRITER_MODEL =
  process.env.ANTHROPIC_WRITER_MODEL ?? "claude-haiku-4-5";
export const CLAUDE_ENABLED = Boolean(process.env.ANTHROPIC_API_KEY);

export class ClaudeError extends Error {}

interface ClaudeJSONOptions {
  system: string;
  user: string;
  search?: boolean;
  temperature?: number;
  /** Override the model for this call (e.g. Haiku for the cheap writing step). */
  model?: string;
  /** Cap output tokens (cost cap). */
  maxTokens?: number;
}

interface ClaudeJSONResult<T> {
  data: T;
  citations: string[];
  model: string;
  usage: { in_tokens: number; out_tokens: number };
}

function collectText(content: unknown): { text: string; urls: string[] } {
  let text = "";
  const urls = new Set<string>();
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === "text" && typeof block.text === "string") text += block.text;
      // Citations can appear on text blocks or search result blocks.
      const cites = block?.citations;
      if (Array.isArray(cites)) {
        for (const c of cites) if (typeof c?.url === "string") urls.add(c.url);
      }
      if (block?.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) if (typeof r?.url === "string") urls.add(r.url);
      }
    }
  }
  return { text, urls: [...urls] };
}

export async function claudeJSON<T>({
  system,
  user,
  // COST FIX: the Anthropic web_search tool (server-side) is what drove the silent
  // ~$10 spend. It is now permanently OFF — this client NEVER attaches web_search
  // and NEVER runs the pricey research leg. Claude is used ONLY as the cheap Haiku
  // copy WRITER (search-free); Grok is our sole live-web researcher.
  search: _search = false,
  temperature = 0.2,
  model,
  maxTokens,
}: ClaudeJSONOptions): Promise<ClaudeJSONResult<T>> {
  void _search;
  if (!CLAUDE_ENABLED) {
    throw new ClaudeError("Claude isn't switched on — set ANTHROPIC_API_KEY.");
  }

  const body: Record<string, unknown> = {
    model: model ?? CLAUDE_WRITER_MODEL,
    max_tokens: maxTokens ?? 1024,
    temperature,
    system,
    messages: [{ role: "user", content: user }],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  let res: Response;
  try {
    res = await fetch(`${ANTHROPIC_BASE}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ClaudeError("Claude took too long and timed out — please try again.");
    }
    throw new ClaudeError(
      `Could not reach Claude: ${err instanceof Error ? err.message : "network error"}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ClaudeError(`Claude request failed (${res.status}). ${detail.slice(0, 300)}`);
  }

  let json: { content?: unknown; model?: string; usage?: Record<string, number> };
  try {
    json = await res.json();
  } catch {
    throw new ClaudeError("Claude returned an unreadable response — please try again.");
  }
  const { text, urls } = collectText(json?.content);
  const cleaned = text.replace(/\[\[\d+\]\]\([^)]*\)/g, "").trim();

  let parsed: T;
  try {
    parsed = JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new ClaudeError("Claude returned no parseable JSON.");
    try {
      parsed = JSON.parse(match[0]) as T;
    } catch {
      throw new ClaudeError("Claude returned malformed JSON.");
    }
  }

  return {
    data: parsed,
    citations: urls.slice(0, 20),
    model: json?.model ?? CLAUDE_MODEL,
    usage: {
      in_tokens: Number(json?.usage?.input_tokens ?? 0) || 0,
      out_tokens: Number(json?.usage?.output_tokens ?? 0) || 0,
    },
  };
}
