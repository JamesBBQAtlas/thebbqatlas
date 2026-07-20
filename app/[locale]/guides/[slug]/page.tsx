import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import ReactMarkdown from "react-markdown";
import { getGuideBySlug, getGuides } from "@/lib/queries/guides";
import { AdSlot } from "@/components/monetization/AdSlot";
import { AffiliateLink } from "@/components/monetization/AffiliateLink";
import { JsonLd } from "@/components/seo/JsonLd";
import { articleJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { TrackView } from "@/components/account/TrackView";
import { routing } from "@/i18n/routing";

interface Props {
  params: { locale: string; slug: string };
}

export const revalidate = 3600;

export async function generateStaticParams() {
  const guides = await getGuides();
  return routing.locales.flatMap((locale) =>
    guides.map((g) => ({ locale, slug: g.slug }))
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = await getGuideBySlug(params.slug);
  if (!guide) return { title: "Guide Not Found" };
  return {
    title: guide.title,
    description: guide.excerpt,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: {
      title: guide.title,
      description: guide.excerpt,
      type: "article",
      publishedTime: guide.published_at || undefined,
      images: guide.hero_image_url ? [guide.hero_image_url] : [],
    },
  };
}

export default async function GuidePage({ params }: Props) {
  setRequestLocale(params.locale);
  const guide = await getGuideBySlug(params.slug);
  if (!guide) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <JsonLd
        data={[
          articleJsonLd(guide),
          breadcrumbJsonLd([
            { name: "Atlas", path: "/" },
            { name: "Guides", path: "/guides" },
            { name: guide.title, path: `/guides/${guide.slug}` },
          ]),
        ]}
      />
      <TrackView
        entityType="guide"
        entityId={guide.id}
        title={guide.title}
        slug={guide.slug}
      />
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