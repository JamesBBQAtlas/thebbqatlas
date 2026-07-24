import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export const metadata: Metadata = {
  title: "The Pitmaster's Pyramid of Greatness",
  description:
    "Fire. Salt. Patience. Not asking for the recipe. The Pitmaster's Pyramid of Greatness, from The BBQ Atlas.",
  alternates: { canonical: "/greatness" },
};

// Bottom (widest, foundation) → top (capstone). Rendered top-down so the
// capstone sits at the top and the foundation anchors the base.
const TIERS = [
  { w: "max-w-[22rem]", text: "The first bite. Silence at the table. That's the whole idea." },
  { w: "max-w-md", text: "Sauce on the side. Always the side." },
  { w: "max-w-lg", text: "Regional humility — every region is right, in its own house." },
  { w: "max-w-xl", text: "Waking up for the brisket. Respecting the pit. Letting it rest." },
  { w: "max-w-2xl", text: "The bark. The smoke ring. A sharp knife. Napkins, plural." },
  { w: "max-w-3xl", text: "Fire. Salt. Patience. Not asking for the recipe." },
];

export default function GreatnessPage({
  params,
}: {
  params: { locale: string };
}) {
  setRequestLocale(params.locale);
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
      <header className="mb-12 text-center">
        <h1 className="font-heading text-4xl font-bold text-text-primary sm:text-5xl">
          The Pitmaster&apos;s Pyramid of Greatness
        </h1>
        <p className="mt-3 text-sm italic text-text-muted">
          You weren&apos;t supposed to find this. Well done.
        </p>
      </header>

      <div className="flex flex-col items-center gap-3">
        {TIERS.map((tier, i) => (
          <div
            key={i}
            className={`${tier.w} w-full rounded-lg border border-brand-sienna/40 bg-gradient-to-b from-brand-sienna/15 to-brand-sienna/5 px-5 py-4 text-center shadow-sm`}
          >
            <p className="font-heading text-base font-semibold leading-snug text-text-primary sm:text-lg">
              {tier.text}
            </p>
          </div>
        ))}
      </div>

      <footer className="mt-14 text-center">
        <p className="mx-auto max-w-xl text-text-secondary">
          We don&apos;t rank barbecue. But if we did, this pyramid would still
          refuse to.
        </p>
        <Link
          href="/map"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-gold hover:underline"
        >
          ← Back to the map
        </Link>
      </footer>
    </div>
  );
}
