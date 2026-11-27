import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { isLocale, withLocale } from "@/lib/i18n";

// Keep old links working without retaining a separate worker workspace.
export default async function WorkerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "he";
  await requireAuth(locale);
  redirect(withLocale(locale, "account"));
}
