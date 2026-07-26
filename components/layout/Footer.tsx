import Image from "next/image";
import { useTranslations } from "next-intl";
import { Instagram } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { EmailCapture } from "@/components/email/EmailCapture";
import { FooterTagline } from "@/components/voice/FooterTagline";
import { ThePromise } from "@/components/voice/ThePromise";

/** Threads logo (not in lucide) — inline so it inherits currentColor. */
function ThreadsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.065 7.168 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.32.145 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z" />
    </svg>
  );
}

/** X (formerly Twitter) logo — inline so it inherits currentColor. */
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** WhatsApp logo (not in lucide) — inline so it inherits currentColor. */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.477-.912zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.767.967-.94 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
    </svg>
  );
}

const EXPLORE = [
  { href: "/map", key: "map" },
  { href: "/directory", key: "directory" },
  { href: "/styles", key: "styles" },
  { href: "/events", key: "events" },
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
  {
    href: "https://whatsapp.com/channel/0029Vb73kIa3gvWix7CwZh2m",
    name: "WhatsApp channel",
    Icon: WhatsAppIcon,
  },
  { href: "https://instagram.com/bbqatlas", name: "Instagram", Icon: Instagram },
  { href: "https://threads.net/@bbqatlas", name: "Threads", Icon: ThreadsIcon },
  { href: "https://x.com/TheBBQAtlas", name: "X", Icon: XIcon },
] as const;

export function Footer({
  footerLines = [],
}: {
  footerLines?: { id: string; text: string; tag: string | null }[];
}) {
  const t = useTranslations("Footer");
  const year = 2026;

  return (
    <footer className="mt-auto border-t border-border-subtle bg-surface-0">
      <div className="pb-mobilenav mx-auto max-w-7xl px-4 py-14 sm:px-6">
        {/* Newsletter capture (P7 consent — see EmailCapture) */}
        <div className="mb-12 flex flex-col gap-5 border-b border-border-subtle pb-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <h3 className="font-heading text-lg font-bold text-text-primary">
              Join the Atlas
            </h3>
            <p className="mt-1.5 text-sm text-text-secondary">
              The world&apos;s great barbecue in your inbox — no spam, unsubscribe
              in one click.
            </p>
          </div>
          <div className="w-full md:max-w-md">
            <EmailCapture source="footer" />
          </div>
        </div>

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
            <FooterTagline lines={footerLines} fallback={t("strapline")} />
            <div className="mt-5 flex items-center gap-3">
              <span className="u-eyebrow text-text-muted">{t("followUs")}</span>
              {SOCIALS.map((s) => (
                <a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border-default text-text-secondary transition-colors hover:border-brand-sienna hover:text-brand-sienna-light"
                >
                  <s.Icon className="h-4 w-4" />
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
          <ThePromise className="mb-4 max-w-xl font-heading text-[0.9375rem] italic text-text-secondary" />
          <p className="text-xs text-text-muted">{t("amazonDisclosure")}</p>
          <p className="mt-2 text-xs text-text-muted">
            © {year} {t("rights")}
          </p>
        </div>
      </div>
    </footer>
  );
}
