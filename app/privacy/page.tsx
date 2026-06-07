export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 prose prose-invert">
      <h1>Privacy Policy</h1>
      <p>Last updated: June 2026</p>
      <p>
        The BBQ Atlas collects minimal personal data: email address and display name for registered users.
        We use Supabase for authentication and data storage with industry-standard security.
      </p>
      <h2>Data We Collect</h2>
      <ul>
        <li>Email address (authentication)</li>
        <li>Display name (optional profile)</li>
        <li>Reviews and submissions you create</li>
      </ul>
      <h2>GDPR</h2>
      <p>You may request deletion of your account and data by contacting hello@thebbqatlas.com.</p>
    </div>
  );
}