import type { Metadata } from "next";
import { EditorialImage } from "@/components/ui/EditorialImage";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getNews } from "@/lib/queries/news";
import type { NewsPost } from "@/lib/types/database";

export const revalidate = 3600;

interface Props {
  params: { locale: string };
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "News & Missives",
    description:
      "Dispatches from the world of live fire, and letters from the pit — news, openings, festival reports and the Atlas's own missives on the craft of barbecue.",
    alternates: { canonical: "/news" },
  };
}

const CATEGORY_LABEL: Record<NewsPost["category"], string> = {
  news: "Dispatch",
  missive: "Missive",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function NewsPage({ params }: Props) {
  setRequestLocale(params.locale);
  const posts = await getNews();
  const [lead, ...rest] = posts;

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
      <header className="mb-12 max-w-2xl">
        <p className="u-eyebrow mb-3 text-brand-gold">From the Pit</p>
        <h1 className="font-heading text-4xl font-bold text-text-primary sm:text-5xl">
          News &amp; Missives
        </h1>
        <p className="mt-4 text-lg text-text-secondary">
          Dispatches from the world of live fire, and long letters from the pit.
          The openings, the festivals, the arguments worth having — and the
          Atlas&apos;s own voice on the craft.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-text-muted">
          No posts yet — the first missives are being written. Check back soon.
        </p>
      ) : (
        <div className="space-y-14">
          {/* Lead story */}
          {lead && (
            <Link
              href={`/news/${lead.slug}`}
              className="group grid grid-cols-1 gap-8 overflow-hidden rounded-2xl border border-border-subtle bg-surface-0 transition-colors hover:border-brand-gold/50 md:grid-cols-2"
            >
              <div className="relative aspect-[16/10] md:aspect-auto">
                <EditorialImage
                  src={lead.hero_image_url}
                  alt={lead.title}
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                />
              </div>
              <div className="flex flex-col justify-center p-8">
                <div className="mb-3 flex items-center gap-3 text-xs">
                  <span className="rounded-full border border-brand-sienna/40 bg-brand-sienna/10 px-2.5 py-0.5 font-semibold uppercase tracking-[0.06em] text-brand-sienna-light">
                    {CATEGORY_LABEL[lead.category]}
                  </span>
                  <span className="text-text-muted">
                    {fmtDate(lead.published_at || lead.created_at)}
                  </span>
                </div>
                <h2 className="font-heading text-2xl font-bold text-text-primary transition-colors group-hover:text-brand-gold sm:text-3xl">
                  {lead.title}
                </h2>
                <p className="mt-3 text-text-secondary">{lead.excerpt}</p>
                <span className="mt-5 text-sm font-semibold text-brand-gold">
                  Read the full piece →
                </span>
              </div>
            </Link>
          )}

          {/* Rest */}
          {rest.length > 0 && (
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((post) => (
                <Link
                  key={post.id}
                  href={`/news/${post.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-0 transition-colors hover:border-brand-gold/50"
                >
                  <div className="relative aspect-[16/9]">
                    <EditorialImage
                      src={post.hero_image_url}
                      alt={post.title}
                      sizes="(max-width: 640px) 100vw, 33vw"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <div className="mb-2.5 flex items-center gap-2.5 text-xs">
                      <span className="rounded-full border border-brand-sienna/40 bg-brand-sienna/10 px-2 py-0.5 font-semibold uppercase tracking-[0.06em] text-brand-sienna-light">
                        {CATEGORY_LABEL[post.category]}
                      </span>
                      <span className="text-text-muted">
                        {fmtDate(post.published_at || post.created_at)}
                      </span>
                    </div>
                    <h2 className="font-heading text-xl font-bold text-text-primary transition-colors group-hover:text-brand-gold">
                      {post.title}
                    </h2>
                    <p className="mt-2 text-sm text-text-muted">{post.excerpt}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
