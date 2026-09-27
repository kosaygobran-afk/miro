import { NextResponse } from "next/server";
import {
  withManagementAuth,
  errorResponse,
} from "@/app/api/management/_shared";

function parsePagination(url: URL) {
  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const offsetParam = Number.parseInt(url.searchParams.get("offset") ?? "", 10);
  const limit =
    Number.isFinite(limitParam) && limitParam >= 1
      ? Math.min(limitParam, 100)
      : 100;
  const offset =
    Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;
  return { limit, offset };
}

// PostgREST or()/ilike parameters are parsed as filter DSL; strip the
// metacharacters so a user-supplied search string cannot break the filter.
function sanitizeSearchTerm(q: string): string {
  return q
    .replace(/[%_,().]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewUsers");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const customerId = url.searchParams.get("id");
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const activeOnly = ["1", "true", "yes"].includes(
    (url.searchParams.get("activeOnly") ?? "").toLowerCase(),
  );
  const { limit, offset } = parsePagination(url);

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

  // q search: ilike on name/phone in SQL; email matching requires the
  // auth.users store, resolved with one bounded admin listing.
  let emailByUser: Map<string, string> | null = null;
  let lastSeenByUser: Map<string, string | null> | null = null;
  let emailMatchIds: string[] = [];
  if (q) {
    const { data: authUsers, error: authError } =
      await admin.auth.admin.listUsers({ perPage: 1000 });
    if (authError) {
      console.error("customers GET auth listing failed:", authError.message);
      return errorResponse("Unable to load customers");
    }
    emailByUser = new Map(
      (authUsers?.users ?? []).map((user) => [user.id, user.email ?? ""]),
    );
    lastSeenByUser = new Map(
      (authUsers?.users ?? []).map((user) => [
        user.id,
        user.last_sign_in_at ?? null,
      ]),
    );
    const needle = q.toLowerCase();
    emailMatchIds = (authUsers?.users ?? [])
      .filter((user) => (user.email ?? "").toLowerCase().includes(needle))
      .map((user) => user.id);
  }

  let query = admin
    .from("profiles")
    .select("id, full_name, phone, account_status, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false });

  if (activeOnly) query = query.eq("account_status", "active");
  if (q) {
    const safe = sanitizeSearchTerm(q);
    const clauses: string[] = [];
    if (safe) {
      clauses.push(`full_name.ilike.%${safe}%`, `phone.ilike.%${safe}%`);
    }
    if (emailMatchIds.length > 0) {
      clauses.push(`id.in.(${emailMatchIds.join(",")})`);
    }
    if (clauses.length === 0) {
      return NextResponse.json({ customers: [], totalCount: 0, limit, offset });
    }
    query = query.or(clauses.join(","));
  }

  const {
    data: profiles,
    error: profilesError,
    count,
  } = await query.range(offset, offset + limit - 1);

  if (profilesError) {
    console.error(
      "customers GET profiles query failed:",
      profilesError.code,
      profilesError.message,
    );
    return errorResponse("Unable to load customers");
  }

  const page = profiles ?? [];
  const pageIds = page.map((profile) => profile.id);
  const { data: roleRows, error: rolesError } =
    pageIds.length > 0
      ? await admin
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", pageIds)
      : { data: [], error: null };

  if (rolesError) {
    console.error("customers GET roles query failed:", rolesError.message);
    return errorResponse("Unable to load customers");
  }

  // Without a q search there is no auth.users listing; fetch email + last
  // sign-in for just this page's ids (bounded by limit <= 100).
  if (!emailByUser || !lastSeenByUser) {
    emailByUser = new Map();
    lastSeenByUser = new Map();
    const results = await Promise.all(
      pageIds.map((id) => admin.auth.admin.getUserById(id)),
    );
    results.forEach(({ data, error }, index) => {
      if (error) {
        console.error(
          "customers GET getUserById failed:",
          pageIds[index],
          error.message,
        );
        return;
      }
      emailByUser!.set(pageIds[index], data.user?.email ?? "");
      lastSeenByUser!.set(pageIds[index], data.user?.last_sign_in_at ?? null);
    });
  }

  const roleByUser = new Map(
    (roleRows ?? []).map((row) => [row.user_id, row.role]),
  );

  return NextResponse.json({
    customers: page.map((profile) => ({
      ...profile,
      email: emailByUser!.get(profile.id) ?? "",
      last_seen_at: lastSeenByUser!.get(profile.id) ?? null,
      role: roleByUser.get(profile.id) ?? "customer",
    })),
    totalCount: count ?? page.length,
    limit,
    offset,
  });
}
