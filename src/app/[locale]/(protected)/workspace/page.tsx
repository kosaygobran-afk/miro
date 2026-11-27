import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { roleHome } from "@/lib/roles";
import { isLocale, withLocale } from "@/lib/i18n";

export default async function WorkspaceEntry({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "he";
  const actor = await requireAuth(locale);
  const { next } = await searchParams;
  redirect(
    withLocale(
      locale,
      (actor.role === "customer" || actor.role === "worker") &&
        next === "checkout"
        ? "checkout"
        : roleHome(actor.role),
    ),
  );
}
