import { getTranslations } from "next-intl/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.about" });
  return pageMetadata({ locale, path: "about", title: t("title"), description: t("description") });
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages.about" });
  const common = await getTranslations({ locale, namespace: "common" });

  return (
    <section className="miro-section">
      <div className="miro-container max-w-3xl">
        <p className="text-sm font-black uppercase tracking-[0.35em] text-accent-text">{common("ownerReview")}</p>
        <h1 className="mt-3 text-4xl font-black">{t("title")}</h1>
        <p className="mt-6 text-lg text-muted-foreground">{t("content")}</p>
      </div>
    </section>
  );
}
