import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UsersManagement } from "@/components/management/users-management";
import { privateMetadata } from "@/components/auth/private-closed-page";

export const generateMetadata = privateMetadata("admin", "users");

type ManagedUser = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  account_status: "active" | "suspended" | "blocked";
  role: "customer" | "worker" | "admin" | "ceo";
  created_at: string;
};

export default async function UsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  const context = await requireRole(safeLocale, ["admin", "ceo"]);
  const isCeo = context.role === "ceo";

  const client = await createServerSupabaseClient();
  const admin = createAdminClient();

  const [
    { data: profiles, error: profilesError },
    { data: roleRows, error: rolesError },
    { data: authUsers, error: authError },
  ] = await Promise.all([
    client
      .from("profiles")
      .select("id, full_name, phone, account_status, created_at")
      .order("created_at", { ascending: false }),
    client.from("user_roles").select("user_id, role"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  if (profilesError || rolesError || authError) {
    // Return empty array on error - UsersManagement will show error state
    return (
      <UsersManagement
        locale={safeLocale}
        canControlAdmins={isCeo}
        initialUsers={[]}
      />
    );
  }

  const roleByUser = new Map(
    (roleRows ?? []).map((row) => [row.user_id, row.role]),
  );
  const emailByUser = new Map(
    (authUsers?.users ?? []).map((user) => [user.id, user.email ?? ""]),
  );

  const initialUsers: ManagedUser[] = (profiles ?? []).map((profile) => ({
    id: profile.id,
    email: emailByUser.get(profile.id) ?? "",
    full_name: profile.full_name,
    phone: profile.phone,
    account_status: profile.account_status as
      "active" | "suspended" | "blocked",
    role: (roleByUser.get(profile.id) ?? "customer") as
      "customer" | "worker" | "admin" | "ceo",
    created_at: profile.created_at,
  }));

  return (
    <UsersManagement
      locale={safeLocale}
      canControlAdmins={isCeo}
      initialUsers={initialUsers}
    />
  );
}
