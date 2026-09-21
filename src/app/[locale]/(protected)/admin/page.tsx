import { CeoSettings } from "@/components/management/ceo-settings";
import { RequestDashboard } from "@/components/requests/request-dashboard";
import { privateMetadata } from "@/components/auth/private-closed-page";
import { isLocale, type Locale } from "@/lib/i18n";
import { requireRole } from "@/lib/auth";
import { ManagementConsole } from "@/components/management/management-console";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const generateMetadata = privateMetadata("admin");

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  const context = await requireRole(safeLocale, ["admin", "ceo"]);
  const admin = await createServerSupabaseClient();
  const [
    { data: profiles, error: profileError },
    { data: roleRows, error: roleError },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, phone, account_status, created_at")
      .order("created_at", { ascending: false }),
    admin.from("user_roles").select("user_id, role"),
  ]);
  const roleByUser = new Map(
    (roleRows ?? []).map((row) => [row.user_id, row.role]),
  );
  return (
    <section className="miro-section">
      <div className="miro-container space-y-8">
        <h1 className="text-3xl font-black">
          {safeLocale === "he" ? "ניהול המערכת" : "Management"}
        </h1>
        {(profileError || roleError) && (
          <p role="status">
            {safeLocale === "he"
              ? "לא ניתן לטעון את החשבונות."
              : "Unable to load accounts."}
          </p>
        )}
        {context.role === "ceo" && <CeoSettings locale={safeLocale} />}
        <RequestDashboard locale={safeLocale} manager />
        <ManagementConsole
          locale={safeLocale}
          canControlAdmins={context.role === "ceo"}
          initialUsers={(profiles ?? []).map((profile) => ({
            ...profile,
            role: roleByUser.get(profile.id) ?? "customer",
          }))}
        />
      </div>
    </section>
  );
}
