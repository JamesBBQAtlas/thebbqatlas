import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getRestaurants } from "@/lib/queries/restaurants";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo/jsonld";
import { BBQ_STYLES, STYLE_LABELS, STYLE_DESCRIPTIONS } from "@/lib/constants/styles";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "BBQ Styles",
  description:
    "Every style of barbecue on The BBQ Atlas — Texas, Carolina, Kansas City, Asado, Korean, Braai and more, from around the world.",
  alternates: { canonical: "/styles" },
};

export default async function StylesIndexPage({
  params,
}: {
  params: { locale: string };
}) {
  setRequestLocale(params.locale);
  const all = await getRestaurants();
  const counts = new Map<string, number>();
  for (const r of all) counts.set(r.style, (counts.get(r.style) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
      <JsonLd
        data={[
          collectionPageJsonLd(
            "BBQ Styles",
            "Every style of barbecue on The BBQ Atlas.",
            "/styles"
          ),
          breadcrumbJsonLd([
            { name: "Atlas", path: "/" },
            { name: "Styles", path: "/styles" },
          ]),
        ]}
      />
      <p className="u-eyebrow mb-3 text-brand-gold">Every tradition</p>
      <h1 className="font-heading text-4xl font-bold text-text-primary sm:text-5xl">
        BBQ Styles
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-text-secondary">
        Every culture that ever caught fire has a version of barbecue. Explore
        the traditions mapped on the Atlas.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {BBQ_STYLES.map((s) => (
          <Link
            key={s}
            href={`/styles/${s}`}
            className="group rounded-xl border border-border-subtle bg-surface-0 p-5 transition-colors hover:border-brand-gold/50"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold text-text-primary transition-colors group-hover:text-brand-gold">
                {STYLE_LABELS[s]}
              </h2>
              <span className="text-xs text-text-muted">{counts.get(s) ?? 0}</span>
            </div>
            <p className="mt-1.5 text-sm text-text-muted">{STYLE_DESCRIPTIONS[s]}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
