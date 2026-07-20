import Script from "next/script";
import { GA_ID, GA_ENABLED } from "@/lib/analytics/ga";

/**
 * Google Analytics 4 with Consent Mode v2.
 *
 * Every storage type defaults to *denied*, so nothing that needs consent fires
 * until the visitor accepts in the cookie banner (which calls
 * gtag('consent','update', …)). Consent Mode still sends cookieless, modelled
 * pings while denied, so aggregate trends survive a "decline".
 *
 * We request analytics AND advertising consent because the roadmap includes
 * AdSense; `ads_data_redaction` keeps ad identifiers stripped until the visitor
 * opts in. A prior choice stored in `bbqatlas_consent` is honoured on load.
 */
export function Analytics() {
  if (!GA_ENABLED) return null;

  return (
    <>
      <Script id="ga-consent-default" strategy="beforeInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          var stored = document.cookie.match(/(?:^|; )bbqatlas_consent=([^;]+)/);
          var granted = stored && stored[1] === 'granted';
          var state = granted ? 'granted' : 'denied';
          gtag('consent', 'default', {
            ad_storage: state,
            ad_user_data: state,
            ad_personalization: state,
            analytics_storage: state,
            wait_for_update: 500
          });
          gtag('set', 'ads_data_redaction', true);
          gtag('set', 'url_passthrough', true);
        `}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
