# Web-Read Engine — Cloudflare Browser Rendering Worker (ops / deploy)

This Worker is the **browser tier** of the Web-Read Engine: the one place a real browser
runs. It renders a URL with JS executing, intercepts the JSON the page fetches (the
locator's own feed), runs declarative interactions to broaden the dataset, and returns a
`ReadPageResult`. The app-side engine (`lib/web-engine/`) is fully unit-tested; **this
Worker needs the live Browser Rendering binding and is deployed/smoke-tested by ops.**

## 1. Enable Browser Rendering (one toggle — James/ops)

Cloudflare account → **Workers & Pages** → **Browser Rendering** → ensure it's enabled.
At our volume (seconds per chain, a handful of chains a day) this sits inside the free
daily allowance on Workers; usage-based beyond that is ~$0.09/browser-hour.

## 2. Deploy the Worker

```
cd workers/web-engine
npm i -D wrangler @cloudflare/puppeteer
npx wrangler secret put WEB_ENGINE_SECRET      # paste a long random string
npx wrangler deploy
```

`wrangler deploy` prints the Worker URL (e.g. `https://thebbqatlas-web-engine.<acct>.workers.dev`).

## 3. Point the app at it

Set two env vars on the Next app (Vercel/Cloudflare — wherever the app runs):

```
WEB_ENGINE_URL=https://thebbqatlas-web-engine.<acct>.workers.dev
WEB_ENGINE_SECRET=<the same secret you set above>
```

Until BOTH are set, `engineConfigured()` is false and the discovery pipeline runs exactly
as it does today (fetch-only) — **no behaviour change ships before the binding is live.**

## 4. Smoke test (confirms render + intercept)

City Barbeque is the cast-iron target — a full Next.js SPA whose locator feed is Olo/NomNom:

```
curl -s -X POST "$WEB_ENGINE_URL" \
  -H "content-type: application/json" \
  -H "x-engine-secret: $WEB_ENGINE_SECRET" \
  -d '{"url":"https://www.citybbq.com/locations","waitFor":"networkidle","capture":{"network":true,"dom":true}}' \
  | node -e 'const r=JSON.parse(require("fs").readFileSync(0));const f=r.networkResponses.find(x=>/nomnom|restaurants/.test(x.url)&&x.body&&x.body.restaurants);console.log("payloads:",r.networkResponses.length,"restaurants:",f?f.body.restaurants.length:0,"renderedNodes:",r.debug.renderedNodes)'
```

Expect `restaurants: ~82` (the Olo feed). That payload is exactly what `parseLocatorFeed`
turns into ~76 deduped "City Barbeque" branches under one flagship (verified in
`scripts/test-web-engine.mts` against a captured slice of this real feed).

## Notes

- The Worker enforces a `budgetMs` cap (≤30s) and caps captured payloads at 200 — the
  cost/runaway guard. The app-side client adds a short per-URL cache + one retry.
- It intercepts only `application/json` / `graphql` responses, and sends a plain
  identifying user-agent. Per-domain politeness/concurrency is governed by the caller
  (queued discovery).
- It returns a **structured** result even on a render error (HTTP 200 with `debug.error`)
  so the caller escalates/hand-seeds — never a silent empty.
