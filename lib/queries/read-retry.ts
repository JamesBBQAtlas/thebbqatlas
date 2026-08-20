/**
 * Retry + last-known-good helpers for cached public reads (BUILD PROMPT 75 —
 * seed-cache-poison fix). Pure and dependency-free so the retry/LKG behaviour is
 * unit-testable without Next or a DB.
 *
 * The point: a transient DB blip (a cold-start right after a redeploy, a pooler
 * hiccup) must NOT surface as a fallback that then gets cached for an hour. We
 * retry a couple of times first (a blip is over in milliseconds), and if the read
 * still fails we serve the last SUCCESSFUL result — never a generic seed — and,
 * crucially, we let the read THROW so `unstable_cache` never persists the failure.
 */

/** Run `readOnce`, retrying on throw with short backoff. Throws the last error
 *  only after all attempts are exhausted. Total attempts = delaysMs.length + 1. */
export async function readWithRetry<T>(
  readOnce: () => Promise<T>,
  opts: { delaysMs?: number[]; sleep?: (ms: number) => Promise<void> } = {}
): Promise<T> {
  const delays = opts.delaysMs ?? [150, 400];
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await readOnce();
    } catch (e) {
      lastErr = e;
      if (attempt < delays.length) await sleep(delays[attempt]);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export interface Lkg<T> {
  /** Record a successful result as the new last-known-good (ignores empty/null). */
  set(v: T | null | undefined): void;
  /** The last-known-good result, or null if we've never had one this instance. */
  get(): T | null;
}

/**
 * A per-instance last-known-good store. In serverless this survives across
 * requests on a warm instance (which is where the transient blips happen), so a
 * momentary failure serves the real, only-slightly-stale list rather than the
 * hard-coded seed. A cold instance has no LKG yet — that's the true last-resort
 * where the seed is the only option, and the retry above is what stops a
 * cold-start blip from ever reaching it.
 */
export function makeLkg<T>(): Lkg<T> {
  let good: T | null = null;
  return {
    set(v) {
      if (v == null) return;
      if (Array.isArray(v) && v.length === 0) return; // never treat empty as good
      good = v;
    },
    get() {
      return good;
    },
  };
}
