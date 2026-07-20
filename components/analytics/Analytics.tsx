import Script from "next/script";

/**
 * Google Analytics 4 with Consent Mode v2.
 *
 * Consent defaults to *denied* for every storage type, so nothing that needs
 * consent fires until the visitor accepts in the cookie banner (which calls
 * gtag('consent','update', …)). If a prior choice is stored in the
 * `bbqatlas_consent` cookie we honour it immediately, so returning visitors
 * don't have consent reset on each load.
 *
 * Renders nothing unless NEXT_PUBLIC_GA_ID is set, so preview/dev stay clean.
 */
export function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  if (!gaId) return null;

  return (
    <>
      <Script id="ga-consent-default" strategy="beforeInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          var stored = document.cookie.match(/(?:^|; )bbqatlas_consent=([^;]+)/);
          var granted = stored && stored[1] === 'granted';
          gtag('consent', 'default', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: granted ? 'granted' : 'denied',
            wait_for_update: 500
          });
        `}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          gtag('js', new Date());
          gtag('config', '${gaId}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
