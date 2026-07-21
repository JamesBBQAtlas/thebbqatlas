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
export const CLAUDE_ENABLED = Boolean(process.env.ANTHROPIC_API_KEY);

export class ClaudeError extends Error {}

interface ClaudeJSONOptions {
  system: string;
  user: string;
  search?: boolean;
  temperature?: number;
}

interface ClaudeJSONResult<T> {
  data: T;
  citations: string[];
  model: string;
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
  search = true,
  temperature = 0.2,
}: ClaudeJSONOptions): Promise<ClaudeJSONResult<T>> {
  if (!CLAUDE_ENABLED) {
    throw new ClaudeError("Claude isn't switched on — set ANTHROPIC_API_KEY.");
  }

  const body: Record<string, unknown> = {
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    temperature,
    system,
    messages: [{ role: "user", content: user }],
  };
  if (search) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }];
  }

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
    });
  } catch (err) {
    throw new ClaudeError(
      `Could not reach Claude: ${err instanceof Error ? err.message : "network error"}`
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ClaudeError(`Claude request failed (${res.status}). ${detail.slice(0, 300)}`);
  }

  const json = await res.json();
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

  return { data: parsed, citations: urls.slice(0, 20), model: json?.model ?? CLAUDE_MODEL };
}
