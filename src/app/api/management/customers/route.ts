import { NextResponse } from "next/server";
import { withManagementAuth } from "@/app/api/management/_shared";

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewUsers");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const customerId = url.searchParams.get("id");

  const { admin } = auth;

  if (customerId) {
    const [
      { data: profile, error: profileError },
      { data: roleRow },
      { data: orders },
      { data: requests },
      { data: events },
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, phone, account_status, created_at")
        .eq("id", customerId)
        .maybeSingle(),
      admin
        .from("user_roles")
        .select("role")
        .eq("user_id", customerId)
        .maybeSingle(),
      admin
        .from("orders")
        .select(
          "id, order_number, status, total, subtotal, vat_total, currency, source, created_at",
        )
        .eq("user_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("service_requests")
        .select("id, service_id, status, message, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("analytics_events")
        .select("event_type, product_id, search_query, created_at")
        .eq("user_id", customerId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      customer: { ...profile, role: roleRow?.role ?? "customer" },
      orders: orders ?? [],
      serviceRequests: requests ?? [],
      events: events ?? [],
    });
  }

  const [
    { data: profiles, error: profilesError },
    { data: roleRows, error: rolesError },
    { data: authUsers },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, phone, account_status, created_at")
      .order("created_at", { ascending: false }),
    admin.from("user_roles").select("user_id, role"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  if (profilesError || rolesError) {
    return NextResponse.json(
      { error: profilesError?.message ?? rolesError?.message },
      { status: 500 },
    );
  }

  const roleByUser = new Map(
    (roleRows ?? []).map((row) => [row.user_id, row.role]),
  );
  const emailByUser = new Map(
    (authUsers?.users ?? []).map((user) => [user.id, user.email ?? ""]),
  );
  const lastSeenByUser = new Map(
    (authUsers?.users ?? []).map((user) => [
      user.id,
      user.last_sign_in_at ?? null,
    ]),
  );

  return NextResponse.json({
    customers: (profiles ?? []).map((profile) => ({
      ...profile,
      email: emailByUser.get(profile.id) ?? "",
      last_seen_at: lastSeenByUser.get(profile.id) ?? null,
      role: roleByUser.get(profile.id) ?? "customer",
    })),
  });
}
