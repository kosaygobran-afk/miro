import { privateMetadata } from "@/components/auth/private-closed-page";
import { PageHeader } from "@/components/management/ui/page-header";
import { WebsitePageCopyEditor } from "@/components/management/website-page-copy-editor";
import { requireRole } from "@/lib/auth";
import { isLocale, withLocale } from "@/lib/i18n";

export const generateMetadata = privateMetadata("admin", "settings");

export default async function WebsitePageCopyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "he";
  const he = locale === "he";
  const actor = await requireRole(locale, ["admin", "ceo"]);

  return (
    <div className="mgmt-page-stack">
      <PageHeader
        title={he ? "טקסטים בעמודי האתר" : "Website page text"}
        breadcrumb={[
          {
            label: he ? "הגדרות" : "Settings",
            href: withLocale(locale, "admin/settings"),
          },
          { label: he ? "טקסטים בעמודי האתר" : "Website page text" },
        ]}
      />
      <WebsitePageCopyEditor locale={locale} canEdit={actor.role === "ceo"} />
    </div>
  );
}
