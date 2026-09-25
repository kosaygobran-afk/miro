import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { roleHome } from "@/lib/roles";
import { isLocale, withLocale } from "@/lib/i18n";

export default async function WorkspaceEntry({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "he";
  const actor = await requireAuth(locale);
  redirect(withLocale(locale, roleHome(actor.role)));
}
