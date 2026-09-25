import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withLocale, type Locale } from "@/lib/i18n";
import { roleHome, type AppRole, type AccountStatus } from "@/lib/roles";

export type { AppRole, AccountStatus } from "@/lib/roles";

export type AuthContext = {
  user: User;
  role: AppRole;
  status: AccountStatus;
  profile: {
    id: string;
    full_name: string | null;
    phone: string | null;
  } | null;
};

function isAppRole(value: string | null | undefined): value is AppRole {
  return (
    value === "customer" ||
    value === "worker" ||
    value === "admin" ||
    value === "ceo"
  );
}

function isAccountStatus(
  value: string | null | undefined,
): value is AccountStatus {
  return value === "active" || value === "suspended" || value === "blocked";
}

export async function getAuthContext(
  supabase?: SupabaseClient,
): Promise<AuthContext | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  )
    return null;
  const client = supabase ?? (await createServerSupabaseClient());
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) return null;

  const [
    { data: profile, error: profileError },
    { data: roleRow, error: roleError },
  ] = await Promise.all([
    client
      .from("profiles")
      .select("id, full_name, phone, account_status")
      .eq("id", user.id)
      .maybeSingle(),
    client
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (
    profileError ||
    roleError ||
    !profile ||
    !isAccountStatus(profile.account_status)
  )
    return null;

  return {
    user,
    role: isAppRole(roleRow?.role) ? roleRow.role : "customer",
    status: isAccountStatus(profile?.account_status)
      ? profile.account_status
      : "active",
    profile: profile
      ? {
          id: profile.id,
          full_name: profile.full_name,
          phone: profile.phone,
        }
      : null,
  };
}

export async function requireAuth(locale: Locale) {
  const context = await getAuthContext();
  if (!context) redirect(withLocale(locale, "login"));
  if (context.status !== "active") redirect(withLocale(locale, "login"));
  return context;
}

export async function requireRole(locale: Locale, roles: AppRole[]) {
  const context = await requireAuth(locale);
  if (!roles.includes(context.role)) {
    redirect(withLocale(locale, roleHome(context.role)));
  }
  return context;
}

export function canManageAccounts(role: AppRole) {
  return role === "ceo" || role === "admin";
}

export function canControlAdmins(role: AppRole) {
  return role === "ceo";
}

export function isCeo(role: AppRole) {
  return role === "ceo";
}
