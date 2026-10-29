import { getTranslations } from "next-intl/server";
import { WorkerNavigation } from "@/components/layout/worker-navigation";
import { privateMetadata } from "@/components/auth/private-closed-page";
import { requireRole } from "@/lib/auth";
import { isLocale } from "@/lib/i18n";
import { RequestDashboard } from "@/components/requests/request-dashboard";
export const generateMetadata = privateMetadata("worker");
export default async function WorkerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "he";
  await requireRole(safeLocale, ["worker", "admin", "ceo"]);
  const t = await getTranslations({
    locale: safeLocale,
    namespace: "layout.header.actions",
  });
  const labels = {
    requestQuote: t("requestQuote"),
    account: t("account"),
    languageSwitch: t("languageSwitch"),
    themeToggle: t("themeToggle"),
    openMenu: t("openMenu"),
    closeMenu: t("closeMenu"),
    logout: t("logout"),
    switchToStorefront: t("switchToStorefront"),
    manageAccount: t("manageAccount"),
    workerArea: t("workerArea"),
    adminConsole: t("adminConsole"),
    myAccount: t("myAccount"),
    userMenu: t("userMenu"),
    roleBadge: t.raw("roleBadge") as string,
  };
  return (
    <>
      <WorkerNavigation locale={safeLocale} labels={labels} />
      <section className="miro-section" data-management-surface="true">
        <div className="miro-container space-y-6">
          <h1 className="text-3xl font-black">
            {safeLocale === "he" ? "סביבת העבודה" : "Your workspace"}
          </h1>
          <RequestDashboard locale={safeLocale} manager={false} />
        </div>
      </section>
    </>
  );
}
