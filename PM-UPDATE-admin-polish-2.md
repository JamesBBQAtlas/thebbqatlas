# PM Update — Admin polish, round 2 (email names + submit friction)

*"Say hello to my little friend."* — Scarface. The little friend being a name policy that finally reads people's names off the file we already have.

Everything below is built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. Items 1, 3, 4 and the Olathe re-enrich were done and verified in the previous pass; this round delivers the expanded item 2 (a full email-name **policy**), the profile name field, and the new item 5 (submit-form normalization).

## Emails now greet by first name — everywhere, as a policy

This is no longer a welcome-email patch; it's one rule applied to every transactional email (welcome, submission received, approved, declined, correction acknowledged):

- **Source of truth is `profiles.display_name`.** Every email reads it and greets by the **first name** — "Welcome, **James**." A shared resolver (`emailFirstName`) does this once; the senders just use it.
- **Never the email prefix, never the @username.** An email-prefix display name (the old auto-default) is treated as "no name on file," not a name to greet by.
- **Fallback order:** display_name → OAuth full_name/name → nothing. (Google gives full_name/name but not given_name, so we don't rely on a first-name field — we take the first token of the full name.)
- **Graceful no-name:** if there's genuinely no name, the greeting drops the name entirely in-voice — "Welcome in." — never "Welcome, ." or "Welcome, jwdoyle." Every template renders cleanly with an empty name.
- **People can set/fix it:** the profile settings field is reframed "**What should we call you?**" with a line explaining it's your email greeting — write "Jim" if you like. It saves to `display_name` and flows to all future emails. Email-only signups can add a name here; anyone can correct one.
- **Backfill:** existing profiles already carry the real name from OAuth (James's is "James Doyle"), so this fixes retroactively the moment the emails read the right field — which they now do.

## Submit form accepts real-world input (item 5)

The form people are most likely to fill in should never bounce them on a technicality:

- **Website** accepts `willsbbq.de`, `www.willsbbq.de`, `http://…`, `https://…`, with or without a path or trailing slash. It's normalized on submit — trimmed, `https://` prepended if there's no scheme, `www` kept exactly as typed — and stored as a clean full URL. The field is no longer a strict `type="url"` input (which was silently blocking bare domains). Only genuine nonsense (no dot/TLD) is rejected, with a friendly hint.
- **Instagram** accepts `@willsbbq`, `willsbbq`, or a full `instagram.com/willsbbq` URL and normalizes to the stored handle.

Verified against the exact examples: `willsbbq.de` → `https://willsbbq.de/`, www/http/path variants preserved correctly, "asdf" rejected, and every IG form resolves to the bare handle.

## Already green (previous pass, unchanged)

Published chain sibling shows no seed badge/CTA; "With real photo" and "Real photo" agree; "Brands" reads 2; the /submit dropdown floats above the map, opaque and deduped; and Joe's KC · Olathe re-enriched to the full address "11950 South Strang Line Road, Olathe, KS 66062" in 2 searches at ~$0.015/run.

The hub and the submission funnel are honest and friction-free. Clear runway for the 66.
