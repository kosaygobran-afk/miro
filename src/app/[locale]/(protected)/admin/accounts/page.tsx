import { AccountsDashboard } from "@/components/management/accounts/accounts-dashboard";
import { PageHeader } from "@/components/management/ui/page-header";

export default async function AccountsPage({
  params,
}: {
  params: Promise<{ locale: "he" | "en" }>;
}) {
  const { locale } = await params;

  return (
    <section className="mgmt-page-stack">
      <PageHeader
        title={locale === "he" ? "חשבונות קופה" : "POS Accounts"}
        subtitle={
          locale === "he"
            ? "קבלות קופה, תשלומים ופעילות מכירה"
            : "POS receipts, payments and register activity"
        }
      />
      <AccountsDashboard locale={locale} />
    </section>
  );
}
