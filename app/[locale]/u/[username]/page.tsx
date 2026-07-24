import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { MapPin, MapPinCheckInside } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  getPublicProfileByUsername,
  getPublicCheckInsForUser,
} from "@/lib/queries/profiles";
import { resolvePublicAvatarUrl } from "@/lib/account/avatar-resolve";
import { SITE, absoluteUrl } from "@/lib/seo/site";

interface Props {
  params: { locale: string; username: string };
}

// Public profiles are cacheable — read only public-safe data via the anon client
// (no cookies), so ISR applies. Refresh every 10 min so new check-ins surface.
export const revalidate = 600;

function firstName(displayName: string | null, username: string | null): string {
  if (displayName && displayName.trim()) return displayName.trim().split(/\s+/)[0];
  return username ? `@${username}` : "they";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getPublicProfileByUsername(params.username);
  if (!profile) {
    return { title: "Profile not found", robots: { index: false, follow: false } };
  }
  const name = profile.display_name?.trim() || `@${profile.username}`;
  const canonical = `/u/${profile.username}`;
  const description = `${name} on The BBQ Atlas — the barbecue spots they've checked into around the world.`;
  return {
    title: `${name} (@${profile.username})`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${name} on The BBQ Atlas`,
      description,
      type: "profile",
      url: absoluteUrl(canonical),
      siteName: SITE.name,
      images: [{ url: SITE.logo }],
    },
    twitter: {
      card: "summary",
      title: `${name} on The BBQ Atlas`,
      description,
    },
  };
}

export default async function PublicProfilePage({ params }: Props) {
  setRequestLocale(params.locale);

  const profile = await getPublicProfileByUsername(params.username);
  if (!profile) notFound();

  const [avatar, checkIns] = await Promise.all([
    resolvePublicAvatarUrl(profile.avatar_url),
    getPublicCheckInsForUser(profile.id, 60),
  ]);

  // Only surface check-ins whose venue is publicly visible (approved).
  const visits = checkIns.filter((c) => c.restaurants?.slug);
  const name = profile.display_name?.trim() || `@${profile.username}`;

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
      {/* Header */}
      <div className="mb-12 flex items-center gap-5">
        <Image
          src={avatar}
          alt={name}
          width={96}
          height={96}
          className="h-24 w-24 shrink-0 rounded-full object-cover ring-2 ring-border-subtle"
        />
        <div className="min-w-0">
          <h1 className="truncate font-heading text-3xl font-bold text-text-primary">
            {name}
          </h1>
          <p className="mt-1 font-semibold text-brand-gold">@{profile.username}</p>
          <p className="mt-2 text-sm text-text-muted">
            {visits.length === 0
              ? "No public check-ins yet"
              : `${visits.length} ${visits.length === 1 ? "place" : "places"} checked in`}
          </p>
        </div>
      </div>

      {/* Public check-ins */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 font-heading text-xl font-bold text-text-primary">
          <MapPinCheckInside className="h-5 w-5 text-brand-sienna" />
          Places {firstName(profile.display_name, profile.username)} has been
        </h2>

        {visits.length === 0 ? (
          <div className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-center">
            <p className="text-text-muted">
              No public check-ins yet. When {firstName(profile.display_name, profile.username)}{" "}
              checks into a venue and shares it, it&apos;ll show up here.
            </p>
            <Link
              href="/map"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-gold hover:underline"
            >
              <MapPin className="h-4 w-4" />
              Explore the map
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {visits.map((c) => (
              <div
                key={c.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-border-subtle bg-surface-0 p-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/restaurants/${c.restaurants!.slug}`}
                    className="font-semibold text-text-primary transition-colors hover:text-brand-gold"
                  >
                    {c.restaurants!.name}
                  </Link>
                  {(c.restaurants!.city || c.restaurants!.country) && (
                    <p className="text-sm text-text-muted">
                      {[c.restaurants!.city, c.restaurants!.country]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                  {c.note && (
                    <p className="mt-1.5 text-sm italic text-text-secondary">
                      &ldquo;{c.note}&rdquo;
                    </p>
                  )}
                </div>
                <span className="mt-0.5 shrink-0 whitespace-nowrap text-xs text-text-muted">
                  {formatDate(c.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
