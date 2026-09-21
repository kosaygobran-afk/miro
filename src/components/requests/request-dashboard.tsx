import { createServerSupabaseClient } from "@/lib/supabase/server";
import { RequestList } from "./request-list";
export async function RequestDashboard({
  locale,
  manager,
}: {
  locale: "he" | "en";
  manager: boolean;
}) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("service_requests")
    .select("id,name,message,status,assigned_worker_id")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error)
    return (
      <p role="status">
        {locale === "he"
          ? "לא ניתן לטעון פניות כרגע."
          : "Requests are currently unavailable."}
      </p>
    );
  const workers: { id: string; name: string }[] = [];
  if (manager) {
    const { data: roles } = await client
      .from("user_roles")
      .select("user_id")
      .eq("role", "worker");
    if (roles?.length) {
      const { data: profiles } = await client
        .from("profiles")
        .select("id,full_name")
        .eq("account_status", "active")
        .in(
          "id",
          roles.map((role) => role.user_id),
        );
      workers.push(
        ...(profiles ?? []).map((profile) => ({
          id: profile.id,
          name: profile.full_name || profile.id,
        })),
      );
    }
  }
  return (
    <RequestList
      locale={locale}
      manager={manager}
      items={data ?? []}
      workers={workers}
    />
  );
}
