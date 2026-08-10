import type { Faq } from "@/lib/seo/hub-content";
import { FaqHashOpener } from "@/components/seo/FaqHashOpener";

/** Stable id/anchor for a question (for deep-linking to a single FAQ). */
function faqId(q: string): string {
  return (
    "faq-" +
    q
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
  );
}

/**
 * Part G — SEO-SAFE FAQ accordion. Collapsing is CSS/visibility only via native
 * <details>/<summary>: EVERY question AND answer is present in the initial HTML
 * (nothing is lazy-loaded/fetched on click), so Google still indexes all Q&A and
 * the separate FAQPage JSON-LD keeps emitting every pair regardless of collapse.
 * <details> gives real accordion semantics for free — a focusable summary button,
 * keyboard operable, screen-reader friendly. First item open by default to reclaim
 * the page real-estate; the rest collapsed. Deep-linking (#faq-…) auto-expands.
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
      <FaqHashOpener />
      <h2 className="mb-6 font-heading text-2xl font-bold text-text-primary">{heading}</h2>
      <div className="space-y-3">
        {faqs.map((f, i) => (
          <details
            key={f.q}
            id={faqId(f.q)}
            open={i === 0}
            className="group rounded-xl border border-border-subtle bg-surface-0 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 font-heading text-base font-bold text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-gold">
              <span>{f.q}</span>
              <span
                aria-hidden="true"
                className="shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="px-5 pb-5 leading-relaxed text-text-secondary">{f.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
