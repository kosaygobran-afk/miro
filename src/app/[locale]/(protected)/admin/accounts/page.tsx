import { AccountsDashboard } from "@/components/management/accounts/accounts-dashboard";

export default async function AccountsPage({
  params,
}: {
  params: Promise<{ locale: "he" | "en" }>;
}) {
  const { locale } = await params;

  return <AccountsDashboard locale={locale} />;
}
