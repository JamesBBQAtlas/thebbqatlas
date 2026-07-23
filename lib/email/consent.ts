/**
 * Marketing consent copy.
 *
 * MARKETING_CONSENT_TEXT is the human-facing checkbox label (no version tag).
 * MARKETING_CONSENT_RECORD is what we persist verbatim to marketing_opt_in_text
 * (the same copy plus a hidden version marker), so every opt-in stays
 * attributable to the exact wording the user agreed to — WITHOUT showing the
 * "[v2]" tag in the UI. Bump MARKETING_CONSENT_VERSION whenever the copy changes.
 */
export const MARKETING_CONSENT_VERSION = "v2";

export const MARKETING_CONSENT_TEXT =
  "Send me The BBQ Atlas Missives — news, the occasional promotion, and good barbecue in your inbox. Only ever from us — we never sell your details, and you can unsubscribe in one click.";

/** Persisted with each opt-in (copy + version). Never shown in the UI. */
export const MARKETING_CONSENT_RECORD = `${MARKETING_CONSENT_TEXT} [${MARKETING_CONSENT_VERSION}]`;
