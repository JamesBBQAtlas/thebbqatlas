/**
 * Tolerant JSON extraction for MODEL responses (#213). A model asked for JSON can
 * still wrap it in ``` fences, preface it with a sentence, or truncate after a
 * balanced object. Strict `JSON.parse` throws on all of these and aborts the
 * enrichment. These helpers recover the object where it's recoverable, and return
 * null (never throw) where it isn't — so the caller can retry or hold cleanly,
 * and the admin never sees a raw parser error.
 */

/**
 * Pull the FIRST balanced JSON object substring out of raw model text — brace- and
 * string-aware, so a `}` inside a string value doesn't end it early. Strips a
 * leading/trailing ``` / ```json fence first. Returns the `{…}` substring, or null
 * when there's no balanced object (e.g. truncated mid-object, or pure prose).
 */
export function extractJsonObject(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  // Prefer the contents of a fenced code block when present.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1].trim()) s = fence[1].trim();
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null; // unbalanced / truncated before the object closed
}

/**
 * Best-effort parse of a model response into T. Tries the text as-is, then the
 * first balanced object inside it (fences / prose stripped). Returns null instead
 * of throwing when nothing usable is present — NEVER surfaces a raw parser error.
 */
export function tryParseModelJson<T>(raw: string | null | undefined): T | null {
  if (raw == null) return null;
  const direct = raw.trim();
  if (direct) {
    try {
      const v = JSON.parse(direct);
      if (v && typeof v === "object") return v as T;
    } catch {
      /* fall through to extraction */
    }
  }
  const obj = extractJsonObject(raw);
  if (!obj) return null;
  try {
    const v = JSON.parse(obj);
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
}
