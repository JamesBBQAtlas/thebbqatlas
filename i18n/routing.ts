import { defineRouting } from "next-intl/routing";

/**
 * i18n routing. en-US ships now; en-GB and others fold in later.
 * localePrefix "as-needed": the default locale (en-US) keeps clean,
 * unprefixed URLs (/restaurants/...), so existing live URLs and SEO are
 * preserved. Future locales get a subdirectory prefix (/en-GB/..., /es/...).
 * No IP-based auto-redirect — locale is suggested via a dismissible banner.
 */
export const routing = defineRouting({
  locales: ["en-US"],
  defaultLocale: "en-US",
  localePrefix: "as-needed",
  localeDetection: false,
});

export type AppLocale = (typeof routing.locales)[number];
