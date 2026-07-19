import Image from "next/image";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { getGuideBySlug } from "@/lib/queries/guides";
import { AdSlot } from "@/components/monetization/AdSlot";
import { AffiliateLink } from "@/components/monetization/AffiliateLink";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props) {
  const guide = await getGuideBySlug(params.slug);
  if (!guide) return { title: "Guide Not Found" };
  return { title: guide.title, description: guide.excerpt };
}

export default async function GuidePage({ params }: Props) {
  const guide = await getGuideBySlug(params.slug);
  if (!guide) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <div className="relative aspect-[21/9] rounded-xl overflow-hidden mb-8">
        <Image src={guide.hero_image_url} alt={guide.title} fill className="object-cover" priority />
      </div>
      <h1 className="text-3xl md:text-4xl font-bold">{guide.title}</h1>
      <p className="text-white/60 mt-2">{guide.excerpt}</p>
      <AdSlot slot="in-content" className="my-6 h-0" />
      <div className="prose prose-invert max-w-none mt-8 prose-headings:text-brand-gold prose-a:text-brand-orange">
        <ReactMarkdown
          components={{
            a: ({ href, children }) => {
              if (href === "#") {
                return <AffiliateLink href="#" label={String(children)} />;
              }
              return <a href={href}>{children}</a>;
            },
          }}
        >
          {guide.content_md}
        </ReactMarkdown>
      </div>
    </article>
  );
}