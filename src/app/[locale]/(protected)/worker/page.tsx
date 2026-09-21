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
  return (
    <section className="miro-section">
      <div className="miro-container space-y-6">
        <h1 className="text-3xl font-black">
          {safeLocale === "he" ? "סביבת העבודה" : "Your workspace"}
        </h1>
        <RequestDashboard locale={safeLocale} manager={false} />
      </div>
    </section>
  );
}
