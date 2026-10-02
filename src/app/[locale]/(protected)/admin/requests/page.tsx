import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import {
  REQUEST_STATUSES,
  type RequestStatus,
} from "@/components/management/requests/types";
import { RequestsQueue } from "@/components/management/requests/requests-queue";
import { privateMetadata } from "@/components/auth/private-closed-page";

export const generateMetadata = privateMetadata("admin", "requests");

export default async function RequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  const context = await requireRole(safeLocale, ["admin", "ceo"]);

  const status =
    typeof query.status === "string" &&
    (REQUEST_STATUSES as readonly string[]).includes(query.status)
      ? (query.status as RequestStatus)
      : "all";
  const stale = query.stale === "true";
  return (
    <RequestsQueue
      key={`${status}:${stale}`}
      initialStatus={status}
      initialStale={stale}
      locale={safeLocale}
      selfId={context.user.id}
      selfName={context.profile?.full_name?.trim() || context.user.email || ""}
    />
  );
}
