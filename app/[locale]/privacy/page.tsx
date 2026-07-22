export const metadata = {
  title: "Privacy Policy",
  description:
    "How The BBQ Atlas collects, uses, and protects your data — cookies and analytics consent, the data we store, the processors we use, and your rights.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 prose prose-invert">
      <h1>Privacy Policy</h1>
      <p>Last updated: July 2026</p>
      <p>
        The BBQ Atlas is a discovery platform for the world&apos;s great
        barbecue. We collect the minimum personal data needed to run the service
        and are transparent about how it&apos;s used. Questions? Email{" "}
        <a href="mailto:hello@thebbqatlas.com">hello@thebbqatlas.com</a>.
      </p>

      <h2>Data we collect</h2>
      <ul>
        <li>
          <strong>Account:</strong> your email address (for authentication) and
          an optional display name, username, and avatar.
        </li>
        <li>
          <strong>Content you create:</strong> venue submissions, corrections,
          check-ins, saved spots, and bookmarks.
        </li>
        <li>
          <strong>Usage &amp; interaction:</strong> to understand what&apos;s
          useful we record lightweight events — pages viewed (your reading
          history) and outbound/partner link clicks. These are tied to your
          account when you&apos;re signed in, and otherwise anonymous.
        </li>
      </ul>

      <h2>Cookies &amp; analytics</h2>
      <p>
        We use Google Analytics 4 with Google Consent Mode v2. By default every
        consent category is set to <em>denied</em>, so no analytics or
        advertising cookies are set until you accept in our cookie banner. If you
        decline, Analytics still receives cookieless, aggregated pings so we can
        see broad trends — but nothing that identifies you. You can change your
        choice at any time from the cookie banner.
      </p>

      <h2>Marketing email</h2>
      <p>
        We only send marketing email if you explicitly opt in (for example, at
        sign-up). We record the exact consent wording and the time you agreed.
        Every marketing email includes a one-click unsubscribe, and you can
        change your preference from your account settings at any time.
        Transactional email (sign-in links, submission outcomes) is sent
        regardless, because it&apos;s necessary to operate your account.
      </p>

      <h2>Processors we use</h2>
      <p>We share data only with the service providers needed to run the Atlas:</p>
      <ul>
        <li>
          <strong>Supabase</strong> — authentication, database, and file storage.
        </li>
        <li>
          <strong>Resend</strong> — sending transactional and (opted-in)
          marketing email.
        </li>
        <li>
          <strong>MapTiler</strong> — map tiles and rendering.
        </li>
        <li>
          <strong>Google</strong> — Analytics (with Consent Mode) and, if you
          choose it, Google sign-in.
        </li>
        <li>
          <strong>Stripe</strong> — payment processing, only if and when paid
          features are enabled (card details go directly to Stripe; we never see
          them).
        </li>
        <li>
          <strong>Vercel</strong> — hosting and content delivery.
        </li>
      </ul>

      <h2>Retention</h2>
      <p>
        We keep account and content data for as long as your account is active.
        Analytics and interaction data are retained only as long as needed for
        product insight. When you delete your account, we remove your personal
        data and the content tied to it, except where we&apos;re required to keep
        limited records (for example, tax records for any purchases).
      </p>

      <h2>Your rights (GDPR &amp; similar)</h2>
      <p>
        You can access, correct, export, or delete your personal data. To request
        deletion of your account and associated data, email{" "}
        <a href="mailto:hello@thebbqatlas.com">hello@thebbqatlas.com</a>.
      </p>
    </div>
  );
}
