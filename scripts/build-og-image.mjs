// Renders the dedicated 1200×630 share card (F-19) with the real brand crest +
// Zilla Slab, via headless Chromium. Output: public/og/atlas-og.jpg
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const b64 = (p) => readFileSync(resolve(root, p)).toString("base64");

const crest = b64("public/logos/crest-emblem.png");
const fontBold = b64("node_modules/@fontsource/zilla-slab/files/zilla-slab-latin-700-normal.woff");
const fontIt = b64("node_modules/@fontsource/zilla-slab/files/zilla-slab-latin-400-italic.woff");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Zilla';font-weight:700;font-style:normal;src:url(data:font/woff;base64,${fontBold}) format('woff');}
@font-face{font-family:'Zilla';font-weight:400;font-style:italic;src:url(data:font/woff;base64,${fontIt}) format('woff');}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:1200px;height:630px;}
.card{position:relative;width:1200px;height:630px;overflow:hidden;
  background:radial-gradient(circle at 50% 34%, rgba(212,175,55,0.16), rgba(212,175,55,0) 46%),
             linear-gradient(150deg,#17110d 0%,#0c0907 55%,#100b08 100%);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  font-family:'Zilla',Georgia,serif;color:#f4ece0;}
.border{position:absolute;inset:26px;border:1px solid rgba(212,175,55,0.28);border-radius:12px;}
.crest{width:188px;height:188px;object-fit:contain;filter:drop-shadow(0 6px 26px rgba(0,0,0,0.5));}
.mark{margin-top:26px;font-weight:700;font-size:74px;letter-spacing:8px;text-transform:uppercase;color:#f6efe2;line-height:1;}
.rule{margin:26px 0 22px;width:132px;height:2px;background:linear-gradient(90deg,rgba(212,175,55,0),#d4af37,rgba(212,175,55,0));}
.tag{font-style:italic;font-weight:400;font-size:31px;color:#e08a4f;letter-spacing:0.5px;}
</style></head><body>
<div class="card">
  <div class="border"></div>
  <img class="crest" src="data:image/png;base64,${crest}"/>
  <div class="mark">The BBQ Atlas</div>
  <div class="rule"></div>
  <div class="tag">The World&rsquo;s Great Barbecue, Mapped</div>
</div>
</body></html>`;

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
mkdirSync(resolve(root, "public/og"), { recursive: true });
await page.locator(".card").screenshot({
  path: resolve(root, "public/og/atlas-og.jpg"),
  type: "jpeg",
  quality: 90,
});
await browser.close();
console.log("wrote public/og/atlas-og.jpg");
