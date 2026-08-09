/**
 * Polite crawler for chain discovery (Part 1, §5). Real User-Agent, per-host
 * robots.txt, small concurrency, a short delay between requests to the same
 * host, a per-run cache, and a hard timeout per request. This is the ONE place
 * the engine touches the open web; everything else is pure parsing.
 *
 * Runs server-side on the deployment (which can reach chain sites). Uses the
 * platform `fetch`; no external HTTP library.
 */

const UA =
  "TheBBQAtlasBot/1.0 (+https://thebbqatlas.com/about; chain locations directory)";

interface RobotsRules {
  disallow: string[];
}

/** Minimal robots.txt parser — collects Disallow paths for `*` and our UA. */
function parseRobots(txt: string): RobotsRules {
  const disallow: string[] = [];
  let applies = false;
  for (const line of txt.split(/\r?\n/)) {
    const l = line.replace(/#.*$/, "").trim();
    if (!l) continue;
    const [rawKey, ...rest] = l.split(":");
    const key = rawKey.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (key === "user-agent") {
      applies = val === "*" || /bbqatlas/i.test(val);
    } else if (key === "disallow" && applies && val) {
      disallow.push(val);
    }
  }
  return { disallow };
}

export interface CrawlerOpts {
  concurrency?: number;
  delayMs?: number;
  timeoutMs?: number;
  maxPages?: number;
}

export class Crawler {
  private cache = new Map<string, string | null>();
  private robots = new Map<string, RobotsRules | null>();
  private lastHit = new Map<string, number>();
  private active = 0;
  private waiters: (() => void)[] = [];
  private readonly concurrency: number;
  private readonly delayMs: number;
  private readonly timeoutMs: number;
  private readonly maxPages: number;
  public fetched = 0;
  public blocked: string[] = [];

  constructor(opts: CrawlerOpts = {}) {
    this.concurrency = opts.concurrency ?? 4;
    this.delayMs = opts.delayMs ?? 350;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxPages = opts.maxPages ?? 1200;
  }

  private async acquire(): Promise<void> {
    if (this.active < this.concurrency) { this.active++; return; }
    await new Promise<void>((r) => this.waiters.push(r));
    this.active++;
  }
  private release(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }

  private async robotsAllows(url: string): Promise<boolean> {
    let u: URL;
    try { u = new URL(url); } catch { return false; }
    const origin = u.origin;
    if (!this.robots.has(origin)) {
      try {
        const res = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(this.timeoutMs) });
        this.robots.set(origin, res.ok ? parseRobots(await res.text()) : { disallow: [] });
      } catch {
        this.robots.set(origin, { disallow: [] });
      }
    }
    const rules = this.robots.get(origin);
    if (!rules) return true;
    return !rules.disallow.some((d) => (d === "/" ? true : u.pathname.startsWith(d)));
  }

  private async throttleHost(host: string): Promise<void> {
    const last = this.lastHit.get(host) ?? 0;
    const wait = last + this.delayMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastHit.set(host, Date.now());
  }

  /** Fetch a URL's raw text (HTML or JSON). Cached, robots-checked, throttled. */
  async get(url: string): Promise<string | null> {
    if (this.cache.has(url)) return this.cache.get(url) ?? null;
    if (this.fetched >= this.maxPages) return null;
    let host: string;
    try { host = new URL(url).host; } catch { this.cache.set(url, null); return null; }

    if (!(await this.robotsAllows(url))) {
      this.blocked.push(url);
      this.cache.set(url, null);
      return null;
    }

    await this.acquire();
    try {
      await this.throttleHost(host);
      this.fetched++;
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "text/html,application/json,application/xhtml+xml,*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const text = res.ok ? await res.text() : null;
      this.cache.set(url, text);
      return text;
    } catch {
      this.cache.set(url, null);
      return null;
    } finally {
      this.release();
    }
  }

  async getJson(url: string): Promise<unknown | null> {
    const text = await this.get(url);
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  }
}
