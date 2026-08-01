# PM Update — Anti-spam on the public submission form (honeypot + IP/country intel)

*"Say hello to my little friend."* — Scarface. Ours is quieter than Tony's, but it keeps the varmints off the lawn just the same.

Built, type-checked, production-built, guardrail-passed (27 write targets, 0 undeclared), and live on `main` + `rebuild`. No venue was reset, deleted, or re-enriched. The abuse log is empty and armed.

## The one structural change that makes it all work

The Submit-a-Spot form used to write straight to the database from the browser. That's fine for a trusted user but useless against a bot: a script skips your page's JavaScript entirely, and the browser can't see the visitor's real IP or country. So the form now posts through a **guarded server endpoint** (`/api/submissions`) instead. Everything below is enforced there, where a bot can't route around it, and where we can read Cloudflare's headers.

## The traps (invisible to real people)

**Honeypot.** The form carries a hidden `company` field — visually removed and taken out of the tab order, so a human never sees or fills it. A form-stuffing bot fills every field it finds, including that one. When it comes back non-empty, we know it's automated: we log the attempt and return a **fake success** so the bot thinks it worked and moves on, none the wiser.

**Time trap.** The form stamps the moment it rendered. A real person takes a while to write a venue description; a bot posts in milliseconds. Anything submitted in under 2.5 seconds is dropped (and logged). A slow human is completely fine — only "too fast" is suspicious.

**Light rate limit.** No real person submits six spots from one IP in ten minutes. If they do, we hold them with a polite "you're going a little too quickly" and log it.

**Basic validation + length caps.** Name, description, at least one style, a valid map pin, and the consent box — plus size caps so nobody can post a giant payload. These are ordinary user-error messages, not spam flags.

None of this adds any friction for a genuine submitter: no CAPTCHA, no puzzle, nothing to click. They fill the form and it works exactly as before.

## The intel you asked for — and how it feeds Cloudflare

Two things are now recorded. Every **accepted** submission is stamped with the submitter's IP, country, and user-agent, so even a good entry carries where it came from (and the Moderation Queue shows the country + IP right on each card). And every **dropped** attempt — honeypot, too-fast, rate-limited — is written to a new append-only `submission_abuse_log`: the reason, IP, country, user-agent, Cloudflare Ray ID, ASN if we have it, what they tried to submit, and a metadata blob. That log is the raw intel feed. The queue also shows a "*N automated submissions blocked in the last 7 days*" line so you can see at a glance whether you're being probed.

Reading provenance is Cloudflare-first — we take the real client IP from `CF-Connecting-IP` and the country from `CF-IPCountry` (the two headers Cloudflare adds in front of us), with Vercel's geo and the standard `x-forwarded-for` as fallbacks so it still works if a request ever arrives without Cloudflare in front.

**Turning that into edge blocking, when you want it.** Once the log shows a pattern — say most junk comes from one country, one ASN (hosting provider), or a handful of IPs — you build a Cloudflare rule from it, no code change on our side:

- **WAF custom rules** (Security → WAF → Custom rules): block or *managed-challenge* by country (`ip.geoip.country`), by ASN (`ip.geoip.asnum` — great for nuking a spammy hosting provider wholesale), by IP/range, or by user-agent substring. Challenge is usually better than outright block — it stops bots while letting a real person through.
- **IP Access Rules** for one-off offenders — a quick block/challenge on a single IP or ASN.
- **Bot Fight Mode** (Security → Bots) — a one-toggle baseline that challenges obvious bots across the whole site; fine to leave on.
- **Rate limiting rules** at the edge — a heavier version of what we do in-app, applied to `/api/submissions` or `/submit` before the request ever reaches us.

The escalation beyond all that, if the form ever gets genuinely hammered by bots clever enough to render CSS and wait, is **Cloudflare Turnstile** — a privacy-friendly, mostly-invisible CAPTCHA alternative you'd drop on the form. I've deliberately *not* built that now: it's overkill for a slow trickle, and the honeypot + time-trap + the intel log should keep the queue clean on their own. It's a small, self-contained add whenever the data says you need it.

## Verify

A real submission goes through untouched (no new friction). A bot that fills the hidden field, or posts instantly, is silently dropped and logged. Repeated hammering from one IP is rate-limited. Accepted submissions carry IP + country, shown on the moderation card, and the 7-day blocked count surfaces there too. Type-check, production build and the write-permission guardrail all pass clean.

## Preserved

Everything shipped still stands: the enrich-in-queue flow, roster dedupe, settlement normalisation, geocode-failure flag, three-step chains, thin-data publish block, full editability, tap-to-place pin, Find IG persistence, closed handling, cache revalidation, and the exact per-call AI usage ledger.
