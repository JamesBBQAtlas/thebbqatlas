import { SITE_URL } from "@/lib/seo/site";

/** Email is entirely gated on RESEND_API_KEY — absent = logged no-op. */
export const EMAIL_ENABLED = Boolean(process.env.RESEND_API_KEY);

export const EMAIL_FROM = {
  transactional:
    process.env.RESEND_FROM_TRANSACTIONAL ?? "The BBQ Atlas <hello@thebbqatlas.com>",
  marketing:
    process.env.RESEND_FROM_MARKETING ??
    "The BBQ Atlas Missives <missives@thebbqatlas.com>",
} as const;

export const EMAIL_REPLY_TO = process.env.RESEND_REPLY_TO ?? "hello@thebbqatlas.com";

export const EMAIL_SITE_URL = SITE_URL;

export { MARKETING_CONSENT_TEXT } from "./consent";
