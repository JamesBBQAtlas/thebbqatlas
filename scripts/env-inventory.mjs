#!/usr/bin/env node
/**
 * Secrets / env-var inventory helper.
 *
 * Scans the codebase for every `process.env.X` the app reads, classifies each by
 * service + where to regenerate it, and prints a markdown table you can drop into a
 * password manager / DR doc. NEVER reads or prints secret VALUES — names only.
 *
 *   node scripts/env-inventory.mjs                       # code scan → markdown table
 *   node scripts/env-inventory.mjs > docs/env-inventory.md
 *   node scripts/env-inventory.mjs --vercel              # also cross-check Vercel
 *
 * --vercel needs (values never fetched — only which KEYS exist + their targets):
 *   VERCEL_TOKEN, and VERCEL_PROJECT_ID + VERCEL_TEAM_ID (or a .vercel/project.json).
 */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

// ---- classification rules (ordered; first match wins) ---------------------------
// kind: "secret" (regenerate from the service), "public" (safe, ships to browser),
//       "config" (a setting/id/flag, not a credential).
const RULES = [
  [/^SUPABASE_SERVICE_ROLE_KEY$/, "Supabase", "secret", "Supabase dashboard → Project Settings → API (service_role). CRITICAL — full DB access."],
  [/^NEXT_PUBLIC_SUPABASE_/, "Supabase", "public", "Supabase → Settings → API (URL + anon key). Safe to expose."],
  [/^STRIPE_SECRET_KEY$/, "Stripe", "secret", "Stripe dashboard → Developers → API keys (secret)."],
  [/^STRIPE_WEBHOOK_SECRET$/, "Stripe", "secret", "Stripe → Developers → Webhooks → the endpoint's signing secret."],
  [/^NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY$/, "Stripe", "public", "Stripe → Developers → API keys (publishable)."],
  [/^STRIPE_.*_PRICE_ID$/, "Stripe", "config", "Stripe → Products → the price id (price_…)."],
  [/^XAI_API_KEY$/, "xAI (Grok)", "secret", "console.x.ai → API keys."],
  [/^XAI_/, "xAI (Grok)", "config", "Model / base-url config (XAI_MODEL, XAI_VISION_MODEL, XAI_BASE_URL)."],
  [/^ANTHROPIC_API_KEY$/, "Anthropic (Claude)", "secret", "console.anthropic.com → API keys."],
  [/^ANTHROPIC_/, "Anthropic (Claude)", "config", "Model / base-url config."],
  [/^BACKUP_S3_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)$/, "Backblaze B2 (backups)", "secret", "Backblaze → Application Keys."],
  [/^BACKUP_S3_/, "Backblaze B2 (backups)", "config", "Bucket / endpoint / region / prefix."],
  [/^BACKUP_(DEST|RETAIN|STORAGE_LIMIT)$/, "Backblaze B2 (backups)", "config", "Backup behaviour (destination, retention, per-run file cap)."],
  [/^RESEND_API_KEY$/, "Resend (email)", "secret", "resend.com → API Keys."],
  [/^RESEND_/, "Resend (email)", "config", "From / reply-to addresses."],
  [/^CLOUDFLARE_API_TOKEN$/, "Cloudflare", "secret", "Cloudflare dashboard → My Profile → API Tokens."],
  [/^CLOUDFLARE_/, "Cloudflare", "config", "Zone id."],
  [/^GOOGLE_PLACES_API_KEY$/, "Google Cloud", "secret", "console.cloud.google.com → APIs & Services → Credentials (Places API)."],
  [/^GOOGLE_BOOKS_API_KEY$/, "Google Cloud", "secret", "Google Cloud → Credentials (Books API)."],
  [/^YOUTUBE_API_KEY$/, "Google Cloud", "secret", "Google Cloud → Credentials (YouTube Data API)."],
  [/^NEXT_PUBLIC_GA_ID$/, "Google Analytics", "public", "GA4 → Admin → Data Streams (measurement id)."],
  [/^(NEXT_PUBLIC_)?MAPTILER_KEY$/, "MapTiler", "secret", "maptiler.com → Account → Keys (the NEXT_PUBLIC one ships to the browser)."],
  [/^CRON_SECRET$/, "Vercel Cron", "secret", "Self-generated random string; must match what the cron routes check."],
  [/^ANALYTICS_SALT$/, "App (internal)", "secret", "Self-generated random string (hashes analytics identifiers)."],
  [/^WEB_ENGINE_SECRET$/, "App (web engine)", "secret", "Self-generated shared secret for the web-engine worker."],
  [/^WEB_ENGINE_URL$/, "App (web engine)", "config", "Web-engine worker URL."],
  [/^(CLAUDE|GROK)_PRICE_/, "App (cost model)", "config", "Per-token / per-search price overrides for the spend ledger."],
  [/^NEXT_PUBLIC_(AMAZON_ONELINK_TAG|DALSTRONG_REF)$/, "Affiliates", "public", "Your affiliate tag / ref code."],
  [/^(ANDROID_|APPLE_)/, "Mobile app links", "config", "From your Play Store / App Store app (assetlinks / apple-app-site-association)."],
  [/^(CONSUMER_PREMIUM_LIVE|SUBMISSION_CAPTCHA_ENABLED|PROVIDER_TIER_OSM)$/, "Feature flags", "config", "On/off switch."],
  [/^NEXT_PUBLIC_SITE_URL$/, "Platform", "config", "Canonical site URL."],
  [/^(NODE_ENV|NEXT_PUBLIC_VERCEL_ENV)$/, "Platform", "config", "Set automatically by Next.js / Vercel — you don't set these by hand."],
];

function classify(name) {
  for (const [re, service, kind, note] of RULES) if (re.test(name)) return { service, kind, note };
  return { service: "Unclassified", kind: "?", note: "Review — not yet categorised." };
}

// ---- scan the code for process.env.X --------------------------------------------
const files = execSync("git ls-files '*.ts' '*.tsx' '*.mjs' '*.js'", { encoding: "utf8" })
  .split("\n").map((s) => s.trim()).filter(Boolean)
  .filter((f) => /^(app|lib|scripts|components|middleware|next\.config)/.test(f));

const names = new Set();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) names.add(m[1]);
}

// ---- optional: which keys are actually set in Vercel (names + targets only) ------
let vercel = null;
if (process.argv.includes("--vercel")) {
  const token = process.env.VERCEL_TOKEN;
  let team = process.env.VERCEL_TEAM_ID;
  let project = process.env.VERCEL_PROJECT_ID;
  if ((!team || !project) && existsSync(".vercel/project.json")) {
    const pj = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
    team = team || pj.orgId; project = project || pj.projectId;
  }
  if (!token || !project) {
    console.error("# NOTE: --vercel needs VERCEL_TOKEN + VERCEL_PROJECT_ID (+ VERCEL_TEAM_ID). Skipping the cross-check.\n");
  } else {
    const url = `https://api.vercel.com/v9/projects/${project}/env${team ? `?teamId=${team}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) console.error(`# NOTE: Vercel env fetch failed (${res.status}). Skipping cross-check.\n`);
    else {
      const body = await res.json();
      vercel = new Map();
      for (const e of body.envs ?? []) vercel.set(e.key, (e.target ?? []).join(", ")); // key + targets, NO value
    }
  }
}

// ---- render markdown -------------------------------------------------------------
const rows = [...names].map((n) => ({ name: n, ...classify(n) }))
  .sort((a, b) => a.service.localeCompare(b.service) || a.name.localeCompare(b.name));

const bySvc = new Map();
for (const r of rows) (bySvc.get(r.service) ?? bySvc.set(r.service, []).get(r.service)).push(r);

const today = execSync("date -u +%Y-%m-%d", { encoding: "utf8" }).trim();
let out = `# Environment variable inventory\n\n`;
out += `_Generated ${today} by \`scripts/env-inventory.mjs\` — a scan of every \`process.env\` the code reads. ` +
  `Names + classification only; secret VALUES are never read or printed. Keep this list; store the actual values in a password manager._\n\n`;
out += `**${rows.length} variables** across ${bySvc.size} services. ` +
  `Secrets to safeguard: **${rows.filter((r) => r.kind === "secret").length}**.\n`;
if (vercel) out += `\n_Vercel cross-check ON: the "In Vercel" column shows which environments each key is set for (names only)._\n`;

for (const [svc, list] of [...bySvc].sort()) {
  out += `\n## ${svc}\n\n`;
  out += `| Variable | Type | ${vercel ? "In Vercel | " : ""}Where to set / regenerate |\n`;
  out += `|---|---|${vercel ? "---|" : ""}---|\n`;
  for (const r of list) {
    const badge = r.kind === "secret" ? "🔐 secret" : r.kind === "public" ? "🌐 public" : "⚙️ config";
    const inV = vercel ? ` ${vercel.get(r.name) ?? "**— not set —**"} |` : "";
    out += `| \`${r.name}\` | ${badge} |${inV} ${r.note} |\n`;
  }
}

if (vercel) {
  const extra = [...vercel.keys()].filter((k) => !names.has(k));
  if (extra.length) {
    out += `\n## ⚠️ Set in Vercel but NOT referenced in code\n\n` +
      `These may be stale (safe to remove) or read somewhere the scan missed — review:\n\n` +
      extra.sort().map((k) => `- \`${k}\` (${vercel.get(k)})`).join("\n") + "\n";
  }
}

process.stdout.write(out);
