import type { Faq } from "@/lib/seo/hub-content";

/**
 * Visible FAQ block for hub/venue pages (Fable H-4). Pairs with faqPageJsonLd so
 * the same Q&A is both human-readable and machine-readable. Server component.
 */
export function HubFaq({
  faqs,
  heading = "Frequently asked",
}: {
  faqs: Faq[];
  heading?: string;
}) {
  if (!faqs.length) return null;
  return (
    <section className="mt-16 max-w-3xl">
      <h2 className="mb-6 font-heading text-2xl font-bold text-text-primary">{heading}</h2>
      <dl className="space-y-3">
        {faqs.map((f) => (
          <div key={f.q} className="rounded-xl border border-border-subtle bg-surface-0 p-5">
            <dt className="font-heading text-base font-bold text-text-primary">{f.q}</dt>
            <dd className="mt-2 leading-relaxed text-text-secondary">{f.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
