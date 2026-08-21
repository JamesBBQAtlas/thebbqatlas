import { TERMS_VERSION } from "@/lib/constants/terms";

export const metadata = {
  title: "Venue Owner Terms",
  description:
    "The terms that apply when you claim, manage, or pay for a venue listing on The BBQ Atlas.",
  alternates: { canonical: "/venue-terms" },
};

/**
 * B3 — versioned owner/venue Terms & Conditions (v1). Shipped now so acceptance can be
 * captured at claim and at first paid checkout; counsel can refine the wording later
 * without changing the acceptance seam (bump TERMS_VERSION when the copy changes
 * materially and existing owners are re-prompted).
 */
export default function VenueTermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 prose prose-invert">
      <h1>Venue Owner Terms</h1>
      <p>
        Version <strong>{TERMS_VERSION}</strong> · Effective August 2026
      </p>
      <p>
        These Venue Owner Terms (&quot;Terms&quot;) apply when you claim, manage, or pay for a
        venue listing on The BBQ Atlas (&quot;we&quot;, &quot;us&quot;,
        &quot;TheBBQAtlas.com&quot;). They are in addition to our general{" "}
        <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>. By
        submitting a claim or completing a paid checkout you agree to these Terms.
      </p>

      <h2>1. Eligibility — you represent the venue</h2>
      <p>
        You may claim a venue only if you are the owner, or an authorised representative of
        the owner, of that venue and are entitled to act on its behalf. We verify claims by
        hand before granting control, and we may ask for evidence of your connection to the
        venue. A claim does not take effect until an administrator approves it.
      </p>

      <h2>2. What you may and may not add</h2>
      <p>
        Page control lets you add your venue&apos;s own legitimate information and offerings —
        your website, ordering, booking/ticketing and gift-card links, your photos, and your
        details. You agree that:
      </p>
      <ul>
        <li>links you add point to your own legitimate products and services;</li>
        <li>outbound links are secure (<code>https</code>) — we reject non-secure links;</li>
        <li>
          you will not attempt to add affiliate, tracking, or redirect links designed to
          rewrite or hijack traffic; we never add our own affiliate tag to your links, and you
          may not add one to defraud us or your customers;
        </li>
        <li>
          you will not post illegal, prohibited, adult, or otherwise restricted goods or
          content, or anything you do not have the right to sell or display.
        </li>
      </ul>

      <h2>3. Moderation — nothing goes live unreviewed</h2>
      <p>
        Edits, photos, and link changes you submit are held as pending and go live only after
        review. We moderate for policy and abuse, not for opinion. We may decline, edit, or
        remove content that breaches these Terms, and we may explain why or decline to.
      </p>

      <h2>4. Photos and rights</h2>
      <p>
        When you upload a photo you confirm that you own it or have the right to post it, and
        you grant us a licence to display it on the venue&apos;s page and in related promotion of
        the Atlas. You must not upload photos you do not have the rights to. We record the
        version of this attestation you agreed to at upload.
      </p>

      <h2>5. Billing, renewal, cancellation and refunds</h2>
      <p>
        Paid listing products are the <strong>Pro</strong> page-control tier ($49/month) and{" "}
        <strong>Featured</strong> prominence ($100/week). Both are rolling and auto-renew.
      </p>
      <ul>
        <li>You may cancel at any time via the Stripe customer portal.</li>
        <li>Access continues to the end of the current paid period.</li>
        <li>
          There are no pro-rata refunds for partial periods, except where required by law.
        </li>
        <li>
          Statutory 14-day cancellation rights are honoured where they legally apply to you.
        </li>
        <li>
          <strong>
            The BBQ Atlas never takes a cut of your own product sales.
          </strong>{" "}
          Payments for goods and services you sell through your own links go directly to you;
          we charge only for the listing products above.
        </li>
      </ul>

      <h2>6. Revoking control</h2>
      <p>
        We may suspend or revoke a claim or page control if a claim proves inaccurate, if these
        Terms are breached, if payment fails, or where necessary to protect the Atlas or the
        public. Where control is revoked, owner-only content stops rendering; the underlying
        venue listing may remain on the Atlas as an ordinary entry.
      </p>

      <h2>7. Acceptable use and liability</h2>
      <p>
        You will use owner tools lawfully and in good faith, and you are responsible for the
        accuracy of what you publish. The Atlas is provided &quot;as is&quot;; to the extent
        permitted by law we are not liable for indirect or consequential loss, and our total
        liability in connection with the listing products is limited to the fees you paid us in
        the preceding twelve months. Nothing in these Terms limits liability that cannot be
        limited by law.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update these Terms; the current version is identified above. When they change
        materially we will ask you to accept the new version before you continue to claim or
        purchase.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms: <a href="mailto:hello@thebbqatlas.com">hello@thebbqatlas.com</a>.
      </p>
    </div>
  );
}
