import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getBrandBySlug, getBrands } from "@/lib/queries/brands";
import { RestaurantCard } from "@/components/restaurants/RestaurantCard";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { routing } from "@/i18n/routing";

interface Props {
  params: { locale: string; slug: string };
}

export const revalidate = 3600;

export async function generateStaticParams() {
  const brands = await getBrands();
  return routing.locales.flatMap((locale) =>
    brands.map((b) => ({ locale, slug: b.slug }))
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getBrandBySlug(params.slug);
  if (!data) return { title: "Brand Not Found" };
  const { brand, locations } = data;
  return {
    title: brand.name,
    description:
      brand.description ??
      `${brand.name} — ${locations.length} location${locations.length === 1 ? "" : "s"} on The BBQ Atlas.`,
    alternates: { canonical: `/brands/${brand.slug}` },
  };
}

const SOCIAL_KEYS = [
  ["instagram_url", "Instagram"],
  ["x_url", "X"],
  ["facebook_url", "Facebook"],
  ["tiktok_url", "TikTok"],
  ["youtube_url", "YouTube"],
] as const;

export default async function BrandPage({ params }: Props) {
  setRequestLocale(params.locale);
  const data = await getBrandBySlug(params.slug);
  if (!data) notFound();
  const { brand, locations } = data;

  const socials = SOCIAL_KEYS.map(([k, label]) => ({
    label: label as string,
    href: brand[k],
  })).filter((s): s is { label: string; href: string } => Boolean(s.href));

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Atlas", path: "/" },
          { name: "Directory", path: "/directory" },
          { name: brand.name, path: `/brands/${brand.slug}` },
        ])}
      />

      <header className="mb-10 max-w-2xl">
        <p className="u-eyebrow mb-3 text-brand-gold">Brand</p>
        <h1 className="font-heading text-4xl font-bold text-text-primary sm:text-5xl">
          {brand.name}
        </h1>
        {brand.description && (
          <p className="mt-4 text-lg text-text-secondary">{brand.description}</p>
        )}
        <p className="mt-4 flex items-center gap-2 text-sm text-text-muted">
          <MapPin className="h-4 w-4" />
          {locations.length} location{locations.length === 1 ? "" : "s"} on the Atlas
        </p>
        {(socials.length > 0 || brand.website) && (
          <div className="mt-5 flex flex-wrap gap-2">
            {brand.website && (
              <a
                href={brand.website}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border-default px-3.5 py-1.5 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
              >
                Website
              </a>
            )}
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border-default px-3.5 py-1.5 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
              >
                {s.label}
              </a>
            ))}
          </div>
        )}
      </header>

      {locations.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface-0 p-6 text-text-muted">
          No locations listed yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((r) => (
            <div key={r.id}>
              {r.location_label && (
                <p className="mb-2 text-sm font-semibold text-brand-sienna-light">
                  {r.location_label}
                </p>
              )}
              <RestaurantCard restaurant={r} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-12">
        <Link
          href="/directory"
          className="text-sm font-semibold text-brand-gold hover:underline"
        >
          ← Back to the directory
        </Link>
      </div>
    </div>
  );
}
