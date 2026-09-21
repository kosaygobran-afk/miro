import { getTranslations } from "next-intl/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.privacy" });
  return pageMetadata({
    locale,
    path: "privacy",
    title: t("title"),
    description: t("description"),
    noIndex: true,
  });
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages.privacy" });
  const common = await getTranslations({ locale, namespace: "common" });
  return (
    <DraftPage
      eyebrow={common("ownerReview")}
      title={t("title")}
      content={t("content")}
    />
  );
}

function DraftPage({
  eyebrow,
  title,
  content,
}: {
  eyebrow: string;
  title: string;
  content: string;
}) {
  return (
    <section className="miro-section miro-page-shell">
      <div className="miro-container">
        <div className="miro-page-panel miro-page-panel-narrow">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-accent-text">
            {eyebrow}
          </p>
          <h1 className="text-4xl font-black">{title}</h1>
          <p className="max-w-3xl text-lg text-muted-foreground">{content}</p>
        </div>
      </div>
    </section>
  );
}
