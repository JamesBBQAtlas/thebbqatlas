import { Link } from "@/i18n/navigation";
import { EditorialImage } from "@/components/ui/EditorialImage";
import { getGuides } from "@/lib/queries/guides";
import { AdSlot } from "@/components/monetization/AdSlot";

export const metadata = {
  title: "Guides",
  description:
    "Expert BBQ guides — regional styles, techniques, gear and road-trip routes to fuel your next smoke session.",
  alternates: { canonical: "/guides" },
};

// Render on every request so the visibility rule (is_published AND
// published_at<=now) is always honoured — no ISR window during which an
// unpublished/future guide could leak, and scheduled pieces appear on time.
export const dynamic = "force-dynamic";

const typeLabel = (t: string | null | undefined) =>
  t === "missive" ? "Missive" : "Guide";

export default async function GuidesPage() {
  const guides = await getGuides();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">BBQ Guides</h1>
      <p className="text-white/60 mb-8">Expert editorial content to fuel your next smoke session or road trip.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {guides.map((guide) => (
          <Link key={guide.id} href={`/guides/${guide.slug}`}>
            <article className="rounded-xl border border-white/10 bg-black/60 overflow-hidden hover:border-brand-gold/40 transition-colors h-full">
              <div className="relative aspect-[16/9]">
                <EditorialImage src={guide.hero_image_url} alt={guide.title} editorial />
              </div>
              <div className="p-6">
                <div className="mb-2 flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-brand-gold/80">
                  <span>{typeLabel(guide.type)}</span>
                  {guide.read_minutes ? (
                    <span className="text-white/40">· {guide.read_minutes} min read</span>
                  ) : null}
                </div>
                <h2 className="text-xl font-bold">{guide.title}</h2>
                <p className="text-white/60 mt-2">{guide.excerpt}</p>
              </div>
            </article>
          </Link>
        ))}
      </div>
      <AdSlot slot="in-content" className="mt-8 h-0" />
    </div>
  );
}