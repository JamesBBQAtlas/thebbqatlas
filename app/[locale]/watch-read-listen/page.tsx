import { ExternalLink, Youtube, BookOpen, Podcast } from "lucide-react";
import { getMediaPicks, type MediaPick } from "@/lib/queries/media-picks";
import { AffiliateLink } from "@/components/monetization/AffiliateLink";
import { AdSlot } from "@/components/monetization/AdSlot";

export const metadata = {
  title: "Watch, Read & Listen",
  description:
    "The barbecue YouTube channels, books and podcasts The BBQ Atlas rates — the people worth your time, with an honest word on each.",
  alternates: { canonical: "/watch-read-listen" },
};

// Render on every request so newly published/unpublished picks appear at once.
export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    kind: "youtube" as const,
    eyebrow: "Watch",
    title: "YouTube channels",
    Icon: Youtube,
    cta: "Watch on YouTube",
  },
  {
    kind: "book" as const,
    eyebrow: "Read",
    title: "Books",
    Icon: BookOpen,
    cta: "View on Amazon",
  },
  {
    kind: "podcast" as const,
    eyebrow: "Listen",
    title: "Podcasts",
    Icon: Podcast,
    cta: "Listen",
  },
];

/** Plain (non-affiliate) outbound link for YouTube / podcasts. */
function OutboundLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-brand-gold transition-colors hover:text-brand-gold-light"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function MediaCard({ pick, cta }: { pick: MediaPick; cta: string }) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-white/10 bg-black/60 p-6 transition-colors hover:border-brand-gold/40">
      <h3 className="text-lg font-bold text-text-primary">{pick.name}</h3>
      {pick.creator ? (
        <p className="mt-0.5 text-sm text-brand-gold/80">{pick.creator}</p>
      ) : null}
      <p className="mt-3 flex-1 text-sm leading-relaxed text-white/60">{pick.blurb}</p>
      <div className="mt-4 flex items-center gap-4">
        {pick.kind === "book" ? (
          <AffiliateLink href={pick.url} label={cta} partner="amazon" product={pick.name} />
        ) : (
          <OutboundLink href={pick.url} label={cta} />
        )}
        {pick.gear_link ? <OutboundLink href={pick.gear_link} label="Their kit" /> : null}
      </div>
    </article>
  );
}

export default async function WatchReadListenPage() {
  const picks = await getMediaPicks();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-bold text-text-primary">Watch, Read &amp; Listen</h1>
        <p className="mt-2 text-white/60">
          The barbecue channels, books and podcasts we rate — the people worth your time, with an
          honest word on each. Links go straight out; the books help keep the Atlas free.
        </p>
      </header>

      {SECTIONS.map(({ kind, eyebrow, title, Icon, cta }) => {
        const items = picks[kind];
        if (!items.length) return null;
        return (
          <section key={kind} className="mb-14">
            <div className="mb-6 flex items-center gap-3 border-b border-white/10 pb-3">
              <Icon className="h-5 w-5 text-brand-gold" aria-hidden />
              <div>
                <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-brand-gold/70">
                  {eyebrow}
                </p>
                <h2 className="text-xl font-bold text-text-primary">{title}</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {items.map((pick) => (
                <MediaCard key={pick.id} pick={pick} cta={cta} />
              ))}
            </div>
          </section>
        );
      })}

      <p className="mt-2 text-xs text-white/30">
        As an Amazon Associate, The BBQ Atlas earns from qualifying purchases. Book links are
        affiliate links; channel and podcast links are not.
      </p>
      <AdSlot slot="in-content" className="mt-8 h-0" />
    </div>
  );
}
