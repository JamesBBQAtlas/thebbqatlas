import Link from "next/link";
import { EditorialImage } from "@/components/ui/EditorialImage";
import { getGuides } from "@/lib/queries/guides";
import { AdSlot } from "@/components/monetization/AdSlot";

export const metadata = { title: "Guides" };

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
                <EditorialImage src={guide.hero_image_url} alt={guide.title} />
              </div>
              <div className="p-6">
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