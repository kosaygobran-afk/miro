import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { withLocale, type Locale } from "@/lib/i18n";

export async function Footer({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "layout.footer" });

  const footerLinks = [
    { href: withLocale(locale), label: t("links.home") },
    { href: withLocale(locale, "services"), label: t("links.services") },
    { href: withLocale(locale, "about"), label: t("links.about") },
    { href: withLocale(locale, "contact"), label: t("links.contact") },
    { href: withLocale(locale, "privacy"), label: t("links.privacy") },
    { href: withLocale(locale, "terms"), label: t("links.terms") },
    {
      href: withLocale(locale, "accessibility"),
      label: t("links.accessibility"),
    },
  ];

  return (
    <footer className="border-t border-border-subtle bg-surface/55">
      <div className="miro-container miro-footer-grid">
        <div>
          <p className="text-3xl font-black text-foreground">{t("brand")}</p>
          <p className="mt-2 max-w-sm text-sm font-bold uppercase tracking-[0.24em] text-muted-foreground">
            {t("tagline")}
          </p>
        </div>

        <nav
          className="grid grid-cols-2 content-start gap-2 sm:grid-cols-3"
          aria-label={t("navLabel")}
        >
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <address className="not-italic text-sm text-muted-foreground">
          <p className="mb-3 font-bold text-foreground">{t("contactTitle")}</p>
          <p className="flex items-center gap-2">
            <Phone className="size-4 text-primary" aria-hidden="true" />
            <span dir="ltr">{t("phonePlaceholder")}</span>
          </p>
          <p className="flex items-center gap-2">
            <Mail className="size-4 text-primary" aria-hidden="true" />
            <span dir="ltr">{t("emailPlaceholder")}</span>
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" aria-hidden="true" />
            {t("areaPlaceholder")}
          </p>
        </address>
      </div>
      <div className="border-t border-border-subtle py-4 text-center text-xs text-muted-foreground">
        {t("copyright", { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}
