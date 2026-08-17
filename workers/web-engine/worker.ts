/**
 * Cloudflare Browser Rendering Worker — the browser tier of the Web-Read Engine.
 *
 * This is the ONE place a real browser runs. It renders a URL with JS executing,
 * intercepts the JSON/GraphQL the page fetches (the locator's own feed — the gold),
 * runs any declarative interactions to broaden the dataset, and returns the
 * `ReadPageResult` the app-side client (lib/web-engine/read-page.ts) expects.
 *
 * NOTE: this file runs on Cloudflare Workers (not in the Next.js/Vercel bundle) and is
 * NOT exercised by the repo's `tsx` test suite — it needs the Browser Rendering binding
 * at runtime. The app-side engine (types, adapters, feed→seeds, orchestrator, budget)
 * IS fully unit-tested; this Worker is the deploy artifact. See README.md to enable the
 * binding, deploy, and smoke-test. Keep it thin — render + intercept + interact + extract.
 */
// @ts-nocheck — Workers runtime + @cloudflare/playwright types are not in the Next tsconfig.
import { launch } from "@cloudflare/playwright";

export interface Env {
  MYBROWSER: Fetcher; // the Browser Rendering binding (wrangler.toml: [browser])
  WEB_ENGINE_SECRET: string;
}

const MAX_BUDGET_MS = 30_000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return json({ error: "POST only" }, 405);
    if (request.headers.get("x-engine-secret") !== env.WEB_ENGINE_SECRET) return json({ error: "unauthorized" }, 401);

    let req: any;
    try {
      req = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const url: string = req?.url;
    if (!url || !/^https?:\/\//i.test(url)) return json({ error: "bad url" }, 400);

    const budgetMs = Math.min(Number(req.budgetMs) || MAX_BUDGET_MS, MAX_BUDGET_MS);
    const started = Date.now();
    const networkResponses: Array<{ url: string; status: number; contentType: string | null; body: unknown }> = [];
    let browser: any = null;

    try {
      browser = await launch(env.MYBROWSER);
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({ "user-agent": "TheBBQAtlas-WebEngine/1.0 (+https://thebbqatlas.com)" });

      // Intercept every JSON/GraphQL response — the primary data source.
      page.on("response", async (resp: any) => {
        try {
          const ct = resp.headers()["content-type"] || "";
          if (!/json|graphql/i.test(ct)) return;
          if (networkResponses.length > 200) return; // safety cap
          const text = await resp.text();
          let body: unknown = text;
          try {
            body = JSON.parse(text);
          } catch {
            /* keep raw text */
          }
          networkResponses.push({ url: resp.url(), status: resp.status(), contentType: ct, body });
        } catch {
          /* ignore a body we can't read */
        }
      });

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: budgetMs });
      // waitFor: selector | ms | "networkidle"
      if (typeof req.waitFor === "string" && req.waitFor !== "networkidle") {
        await page.waitForSelector(req.waitFor, { timeout: 8000 }).catch(() => {});
      } else if (typeof req.waitFor === "number") {
        await page.waitForTimeout(Math.min(req.waitFor, 8000));
      } else {
        await page.waitForLoadState?.("networkidle", { timeout: 8000 }).catch(() => {});
      }

      // Ordered interactions — broaden a search, load-all, paginate, scroll.
      for (const step of req.interactions ?? []) {
        if (Date.now() - started > budgetMs) break;
        try {
          if (step.type === "click") await page.click(step.selector, { timeout: 5000 });
          else if (step.type === "type") await page.fill(step.selector, step.text, { timeout: 5000 });
          else if (step.type === "press") await page.keyboard.press(step.key);
          else if (step.type === "waitFor") {
            if (step.selector) await page.waitForSelector(step.selector, { timeout: step.ms ?? 5000 }).catch(() => {});
            else await page.waitForTimeout(Math.min(step.ms ?? 1000, 8000));
          } else if (step.type === "scroll") {
            for (let i = 0; i < (step.times ?? 3); i++) {
              await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
              await page.waitForTimeout(400);
            }
          }
        } catch {
          /* a failed interaction is not fatal — capture what we have */
        }
      }

      const cap = req.capture ?? {};
      const dom = cap.dom ? await page.content() : null;
      const text = cap.text ? await page.evaluate(() => document.body?.innerText ?? "") : null;
      const renderedNodes = await page.evaluate(() => document.querySelectorAll("*").length).catch(() => 0);
      const finalUrl = page.url();
      await browser.close();
      browser = null;

      return json({
        finalUrl,
        networkResponses: cap.network === false ? [] : networkResponses,
        dom,
        text,
        debug: {
          renderedNodes,
          capturedPayloads: networkResponses.length,
          tier: networkResponses.length ? "network" : dom ? "dom" : null,
          browserMs: Date.now() - started,
          error: null,
        },
      });
    } catch (err: any) {
      if (browser) await browser.close().catch(() => {});
      return json(
        {
          finalUrl: url,
          networkResponses,
          dom: null,
          text: null,
          debug: {
            capturedPayloads: networkResponses.length,
            tier: networkResponses.length ? "network" : null,
            browserMs: Date.now() - started,
            error: String(err?.message ?? err),
          },
        },
        200 // a render error is still a structured result, not an HTTP failure
      );
    }
  },
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
