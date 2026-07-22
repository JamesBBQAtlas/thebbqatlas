/**
 * GA4 measurement id, from NEXT_PUBLIC_GA_ID. No committed default — set it ONLY
 * in the production Vercel environment (F-21).
 *
 * GA runs ONLY on the real production deployment — never in local dev and never
 * on Vercel preview builds — so preview/dev page views don't pollute reports.
 * We gate on NEXT_PUBLIC_VERCEL_ENV (not NODE_ENV, which is "production" for
 * preview builds too).
 */
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";

export const GA_ENABLED =
  Boolean(GA_ID) && process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
