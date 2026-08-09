import { SubmitForm } from "@/components/submit/SubmitForm";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Submit a Spot" };

export default async function SubmitPage() {
  // Pre-fill the email for a signed-in member so submitting is one click for
  // them (email is now required — see Part 5). Best-effort; anonymous is fine.
  let defaultEmail = "";
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    defaultEmail = data.user?.email ?? "";
  } catch {
    /* anonymous visitor */
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Submit a Spot</h1>
      <p className="text-white/60 mb-8">
        Know a great BBQ restaurant? Submit it for review. All submissions pass through moderation before going live.
      </p>
      <SubmitForm defaultEmail={defaultEmail} />
    </div>
  );
}
