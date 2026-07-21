import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import ReactMarkdown from "react-markdown";
import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";
import { getNews, getNewsBySlug } from "@/lib/queries/news";
import { JsonLd } from "@/components/seo/JsonLd";
import { newsJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { TrackView } from "@/components/account/TrackView";
import { BookmarkButton } from "@/components/content/BookmarkButton";
import { routing } from "@/i18n/routing";

interface Props {
  params: { locale: string; slug: string };
}

export const revalidate = 3600;

export async function generateStaticParams() {
  const posts = await getNews();
  return routing.locales.flatMap((locale) =>
    posts.map((p) => ({ locale, slug: p.slug }))
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getNewsBySlug(params.slug);
  if (!post) return { title: "Post Not Found" };
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/news/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.published_at || undefined,
      images: post.hero_image_url ? [post.hero_image_url] : [],
    },
  };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function NewsPostPage({ params }: Props) {
  setRequestLocale(params.locale);
  const post = await getNewsBySlug(params.slug);
  if (!post) notFound();

  const label = post.category === "news" ? "Dispatch" : "Missive";

  return (
    <article className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
      <JsonLd
        data={[
          newsJsonLd(post),
          breadcrumbJsonLd([
            { name: "Atlas", path: "/" },
            { name: "News & Missives", path: "/news" },
            { name: post.title, path: `/news/${post.slug}` },
          ]),
        ]}
      />
      <TrackView
        entityType="news"
        entityId={post.id}
        title={post.title}
        slug={post.slug}
      />

      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-text-muted"
      >
        <Link href="/" className="transition-colors hover:text-brand-gold">
          Atlas
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-border-strong" />
        <Link href="/news" className="transition-colors hover:text-brand-gold">
          News &amp; Missives
        </Link>
      </nav>

      <div className="mb-4 flex items-center gap-3 text-xs">
        <span className="rounded-full border border-brand-sienna/40 bg-brand-sienna/10 px-2.5 py-0.5 font-semibold uppercase tracking-[0.06em] text-brand-sienna-light">
          {label}
        </span>
        <span className="text-text-muted">
          {fmtDate(post.published_at || post.created_at)}
        </span>
        {post.author && (
          <span className="text-text-muted">· {post.author}</span>
        )}
      </div>

      <div className="flex items-start justify-between gap-4">
        <h1 className="font-heading text-3xl font-bold leading-tight text-text-primary sm:text-4xl">
          {post.title}
        </h1>
        <div className="shrink-0 pt-1">
          <BookmarkButton
            entityType="news"
            entityId={post.id}
            title={post.title}
            slug={post.slug}
          />
        </div>
      </div>
      <p className="mt-3 text-lg text-text-secondary">{post.excerpt}</p>

      <div className="relative mt-8 aspect-[21/9] overflow-hidden rounded-xl">
        <Image
          src={post.hero_image_url}
          alt={post.title}
          fill
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover"
          priority
        />
      </div>

      <div className="prose prose-invert mt-10 max-w-none prose-headings:font-heading prose-headings:text-text-primary prose-a:text-brand-gold prose-strong:text-text-primary">
        <ReactMarkdown>{post.content_md}</ReactMarkdown>
      </div>

      <div className="mt-14 border-t border-border-subtle pt-8">
        <Link
          href="/news"
          className="text-sm font-semibold text-brand-gold hover:underline"
        >
          ← All News &amp; Missives
        </Link>
      </div>
    </article>
  );
}
