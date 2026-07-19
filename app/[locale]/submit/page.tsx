import { SubmitForm } from "@/components/submit/SubmitForm";

export const metadata = { title: "Submit a Spot" };

export default function SubmitPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Submit a Spot</h1>
      <p className="text-white/60 mb-8">
        Know a great BBQ restaurant? Submit it for review. All submissions pass through moderation before going live.
      </p>
      <SubmitForm />
    </div>
  );
}