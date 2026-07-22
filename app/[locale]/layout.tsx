import type { Metadata, Viewport } from "next";
// Self-hosted fonts (no external Google Fonts request — faster + GDPR-friendly).
// Zilla Slab = display/headings + wordmark; Source Sans 3 = body/UI.
import "@fontsource/zilla-slab/400.css";
import "@fontsource/zilla-slab/500.css";
import "@fontsource/zilla-slab/600.css";
import "@fontsource/zilla-slab/700.css";
import "@fontsource/zilla-slab/400-italic.css";
import "@fontsource/zilla-slab/700-italic.css";
import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/source-sans-3/wght-italic.css";
import "flag-icons/css/flag-icons.min.css";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { FooterGate } from "@/components/layout/FooterGate";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { JsonLd } from "@/components/seo/JsonLd";
import { Analytics } from "@/components/analytics/Analytics";
import { CookieConsent } from "@/components/analytics/CookieConsent";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/jsonld";
import { BRAND } from "@/lib/constants/styles";
import "../globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://thebbqatlas.com"
  ),
  title: {
    default: `${BRAND.name} — The Michelin Guide for Barbecue`,
    template: `%s | ${BRAND.name}`,
  },
  description:
    "A curated global atlas of the world's great barbecue — smokehouses, asados, Korean grills and more. Explore the map, read the guides, celebrate the craft.",
  openGraph: {
    siteName: BRAND.name,
    type: "website",
    // Branded default OG image (per-route pages set their own where relevant).
    images: [{ url: "/logos/crest-gold.jpg", width: 1200, height: 1200 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — The Michelin Guide for Barbecue`,
    description:
      "A curated global atlas of the world's great barbecue. Explore the map, read the guides, celebrate the craft.",
    images: ["/logos/crest-gold.jpg"],
  },
  applicationName: BRAND.name,
  appleWebApp: {
    capable: true,
    title: BRAND.name,
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

// Mobile-first viewport: viewport-fit=cover unlocks safe-area insets (notch /
// home-indicator handling), and theme-color paints the browser chrome in the
// brand warm-black so an installed PWA feels native. userScalable stays on for
// accessibility; we cap max-scale rather than disabling zoom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c0907",
  colorScheme: "dark",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-background font-body text-text-primary antialiased">
        {/* Warm up the map tile host so the flagship map paints sooner (F-23). */}
        <link rel="preconnect" href="https://api.maptiler.com" crossOrigin="" />
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
        <Analytics />
        <NextIntlClientProvider messages={messages}>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-brand-gold focus:px-4 focus:py-2 focus:font-semibold focus:text-brand-black"
          >
            Skip to content
          </a>
          <Header />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <FooterGate>
            <Footer />
          </FooterGate>
          <MobileTabBar />
          <CookieConsent />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
