import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const EXPLORE = [
  { href: "/map", key: "map" },
  { href: "/directory", key: "directory" },
  { href: "/styles", key: "styles" },
  { href: "/guides", key: "guides" },
  { href: "/news", key: "news" },
  { href: "/gear", key: "gear" },
  { href: "/submit", key: "submit" },
] as const;

const ACCOUNT = [
  { href: "/profile", key: "myAtlas" },
  { href: "/login", key: "signIn" },
  { href: "/list", key: "list" },
] as const;

const COMPANY = [
  { href: "/about", key: "about" },
  { href: "/contact", key: "contact" },
  { href: "/privacy", key: "privacy" },
  { href: "/terms", key: "terms" },
  { href: "/disclaimer", key: "disclaimer" },
] as const;

const SOCIALS = [
  { label: "IG", href: "https://instagram.com/thebbqatlas", name: "Instagram" },
  { label: "TH", href: "https://threads.net/@thebbqatlas", name: "Threads" },
] as const;

export function Footer() {
  const t = useTranslations("Footer");
  const year = 2026;

  return (
    <footer className="mt-auto border-t border-border-subtle bg-surface-0">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/logos/crest-emblem.png"
                alt="The BBQ Atlas"
                width={52}
                height={52}
                className="h-12 w-12 object-contain"
              />
              <span className="font-heading text-lg font-bold uppercase tracking-[0.05em] text-text-primary">
                The BBQ Atlas
              </span>
            </Link>
            <p className="mt-4 font-heading text-base italic text-brand-gold">
              {t("strapline")}
            </p>
            <div className="mt-5 flex items-center gap-3">
              <span className="u-eyebrow text-text-muted">{t("followUs")}</span>
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border-default text-xs font-semibold text-text-secondary transition-colors hover:border-brand-sienna hover:text-brand-sienna-light"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>

          {/* Explore */}
          <div>
            <h3 className="u-eyebrow text-text-muted">{t("explore")}</h3>
            <ul className="mt-4 space-y-3">
              {EXPLORE.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-text-secondary transition-colors hover:text-brand-gold"
                  >
                    {t(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Account */}
          <div>
            <h3 className="u-eyebrow text-text-muted">{t("account")}</h3>
            <ul className="mt-4 space-y-3">
              {ACCOUNT.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-text-secondary transition-colors hover:text-brand-gold"
                  >
                    {t(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="u-eyebrow text-text-muted">{t("company")}</h3>
            <ul className="mt-4 space-y-3">
              {COMPANY.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-text-secondary transition-colors hover:text-brand-gold"
                  >
                    {t(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border-subtle pt-6">
          <p className="text-xs text-text-muted">{t("amazonDisclosure")}</p>
          <p className="mt-2 text-xs text-text-muted">
            © {year} {t("rights")}
          </p>
        </div>
      </div>
    </footer>
  );
}
