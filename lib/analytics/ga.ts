/**
 * GA4 measurement id. It is public (it appears in every page's HTML), so a
 * committed default is fine; NEXT_PUBLIC_GA_ID overrides it when set.
 *
 * GA only runs in production builds (Vercel preview + production) — never in
 * local `next dev` — so development page views don't pollute the reports.
 */
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-N317NMQFXX";

export const GA_ENABLED =
  Boolean(GA_ID) && process.env.NODE_ENV === "production";
