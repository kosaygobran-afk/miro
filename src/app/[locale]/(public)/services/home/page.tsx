import Link from "next/link";
import { Home, ShieldCheck, Wifi } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.homeServices" });
  return pageMetadata({ locale, path: "services/home", title: t("title"), description: t("description") });
}

export default async function HomeServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const t = await getTranslations({ locale, namespace: "pages.services.home" });
  const common = await getTranslations({ locale, namespace: "common" });

  return (
    <section className="miro-section">
      <div className="miro-container grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.35em] text-accent-text">{common("ownerReview")}</p>
          <h1 className="mt-3 text-4xl font-black">{t("title")}</h1>
          <p className="mt-4 text-xl text-muted-foreground">{t("subtitle")}</p>
          <p className="mt-6 text-muted-foreground">{t("content")}</p>
          <Link href={withLocale(locale, "contact")} className="miro-button miro-button-primary mt-8">
            {common("learnMore")}
          </Link>
        </div>
        <div className="miro-card grid gap-4 p-5 sm:grid-cols-3">
          {[Home, ShieldCheck, Wifi].map((Icon, index) => (
            <div key={index} className="rounded-xl bg-surface-muted p-5 text-center">
              <Icon className="mx-auto mb-4 size-12 text-primary" aria-hidden="true" />
              <div className="h-2 rounded bg-muted-foreground/30" />
              <div className="mx-auto mt-3 h-2 w-2/3 rounded bg-muted-foreground/20" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
