export const metadata = { title: "Disclaimer" };

export default function DisclaimerPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 prose prose-invert">
      <h1>Disclaimer</h1>
      <p>
        The BBQ Atlas is a discovery and community platform. Restaurant listings and editorial content are provided
        for informational purposes only and represent the opinions of individual contributors and our editors.
      </p>
      <p>
        We do not guarantee the accuracy, completeness, or safety of any establishment listed.
        Always verify hours, availability, and dietary requirements directly with restaurants.
      </p>
      <p>
        Affiliate links may earn The BBQ Atlas a commission at no extra cost to you.
        We are not the seller of any products linked on this site.
      </p>
    </div>
  );
}