import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Flame, Globe2, HeartHandshake } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description:
    "The BBQ Atlas is a global map of great barbecue — every culture that ever caught fire, celebrated rather than ranked.",
  alternates: { canonical: "/about" },
};

const PILLARS = [
  {
    icon: Flame,
    title: "We celebrate, we don't rank",
    body: "No star scores flattening a lifetime's craft into a number. Every pin is a place someone is doing it right over live fire.",
  },
  {
    icon: Globe2,
    title: "We go everywhere",
    body: "Texas post-oak brisket, Argentine asado, Korean tabletop, Cape Malay braai, Carolina whole hog — if it's cooked with fire and love, it belongs on the map.",
  },
  {
    icon: HeartHandshake,
    title: "We keep it honest",
    body: "Closed venues get marked closed. Corrections get read. Facts come from venues themselves, and every enrichment keeps its sources.",
  },
];

export default function AboutPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
      <p className="u-eyebrow mb-3 text-brand-gold">Our story</p>
      <h1 className="font-heading text-4xl font-bold text-text-primary sm:text-5xl">
        A map for the faithful
      </h1>

      <div className="mt-6 space-y-5 text-lg leading-[1.75] text-text-secondary">
        <p>
          Barbecue is the oldest way we cook and the most human way we gather.
          Every culture that ever caught fire has a version of it — and until
          now, no one had put all of it in one place.
        </p>
        <p>
          The BBQ Atlas is that place: a living, global map of great barbecue.
          Not a leaderboard, not a league table — a map, because the truth of
          barbecue is that it lives somewhere, cooked by someone, for a community
          that already knows it&apos;s good. We&apos;re here to help you find it,
          wherever in the world you are.
        </p>
      </div>

      <div className="mt-12 space-y-4">
        {PILLARS.map((p) => (
          <div
            key={p.title}
            className="flex items-start gap-4 rounded-xl border border-border-subtle bg-surface-0 p-5"
          >
            <p.icon className="mt-0.5 h-6 w-6 shrink-0 text-brand-gold" />
            <div>
              <h2 className="font-heading text-lg font-bold text-text-primary">
                {p.title}
              </h2>
              <p className="mt-1 text-text-secondary">{p.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-border-default bg-surface-0 p-8 text-center">
        <h2 className="font-heading text-2xl font-bold text-text-primary">
          Know a joint we&apos;re missing?
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-text-secondary">
          The map grows every week. Add a spot, claim your venue, or just tell us
          about the best barbecue you&apos;ve ever had.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link
            href="/submit"
            className="rounded-md bg-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90"
          >
            Submit a spot
          </Link>
          <Link
            href="/contact"
            className="rounded-md border border-border-default px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
          >
            Get in touch
          </Link>
        </div>
      </div>
    </div>
  );
}
