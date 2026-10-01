import { hasSameOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { getAuthContext, isCeo } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
} from "@/app/api/management/_shared";

const roles = ["customer", "worker", "admin"] as const;
const statuses = ["active", "suspended", "blocked"] as const;
const roleFilters = ["customer", "worker", "admin", "ceo"] as const;

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

// Per-IP rate limiting for management read endpoints (tiered: 60/min, 300/hour)
async function checkManagementReadRateLimit(
  admin: ReturnType<typeof createAdminClient>,
  ip: string,
): Promise<"ok" | "limited" | "error"> {
  const buckets = [
    { key: `mgmt:read:ip:1m:${ip}`, limit: 60, window: "1 minute" },
    { key: `mgmt:read:ip:1h:${ip}`, limit: 300, window: "1 hour" },
  ] as const;
  for (const bucket of buckets) {
    const { data: allowed, error } = await admin.rpc("check_rate_limit", {
      p_key: bucket.key,
      p_limit: bucket.limit,
      p_window: bucket.window,
    });
    if (error) {
      console.error("check_rate_limit failed:", error.code, error.message);
      return "error";
    }
    if (allowed !== true) return "limited";
  }
  return "ok";
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewUsers");
  if (!auth.ok) return auth.response;

  // Rate limit management read endpoints per IP
  const rateLimit = await checkManagementReadRateLimit(
    auth.admin,
    getClientIp(request),
  );
  if (rateLimit === "error") {
    return errorResponse("Unable to process request", 503);
  }
  if (rateLimit === "limited") {
    return NextResponse.json(
      { error: "Too many requests", code: "rate_limited" },
      { status: 429 },
    );
  }

  const url = new URL(request.url);
  const rawQ = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const roleParam = url.searchParams.get("role");
  const statusParam = url.searchParams.get("status");
  const role = roleFilters.find((value) => value === roleParam);
  const status = statuses.find((value) => value === statusParam);
  const { limit, offset } = parsePagination(url);

  const { admin } = auth;

  // Role filtering happens through user_roles ids (no FK join across to auth).
  let roleIds: string[] | null = null;
  if (role) {
    const { data, error } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", role);
    if (error) {
      console.error("users GET role filter failed:", error.code, error.message);
      return errorResponse("Unable to load users");
    }
    roleIds = (data ?? []).map((row) => row.user_id);
    if (roleIds.length === 0) {
      return NextResponse.json({ users: [], totalCount: 0, limit, offset });
    }
  }

  // Emails live in auth.users only. A q search must also match email, and
  // GoTrue cannot ilike-filter, so one bounded admin listing resolves the
  // matching ids. IDs are UUIDs, so they are safe to inline into in.().
  let emailByUser: Map<string, string> | null = null;
  let emailMatchIds: string[] = [];
  if (rawQ) {
    const { data: authUsers, error: authError } =
      await admin.auth.admin.listUsers({ perPage: 1000 });
    if (authError) {
      console.error("users GET auth listing failed:", authError.message);
      return errorResponse("Unable to load users");
    }
    emailByUser = new Map(
      (authUsers?.users ?? []).map((user) => [user.id, user.email ?? ""]),
    );
    const needle = rawQ.toLowerCase();
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

  if (status) query = query.eq("account_status", status);
  if (roleIds) query = query.in("id", roleIds);
  if (rawQ) {
    const safe = sanitizeSearchTerm(rawQ);
    const clauses: string[] = [];
    if (safe) {
      clauses.push(`full_name.ilike.%${safe}%`, `phone.ilike.%${safe}%`);
    }
    if (emailMatchIds.length > 0) {
      clauses.push(`id.in.(${emailMatchIds.join(",")})`);
    }
    if (clauses.length === 0) {
      return NextResponse.json({ users: [], totalCount: 0, limit, offset });
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
      "users GET profiles query failed:",
      profilesError.code,
      profilesError.message,
    );
    return errorResponse("Unable to load users");
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
    console.error("users GET roles query failed:", rolesError.message);
    return errorResponse("Unable to load users");
  }

  // Without a q search there is no auth.users listing; fetch emails for just
  // this page's ids (bounded by limit <= 100).
  if (!emailByUser) {
    emailByUser = new Map();
    const results = await Promise.all(
      pageIds.map((id) => admin.auth.admin.getUserById(id)),
    );
    results.forEach(({ data, error }, index) => {
      if (error) {
        console.error(
          "users GET getUserById failed:",
          pageIds[index],
          error.message,
        );
        return;
      }
      emailByUser!.set(pageIds[index], data.user?.email ?? "");
    });
  }

  const roleByUser = new Map(
    (roleRows ?? []).map((row) => [row.user_id, row.role]),
  );
  return NextResponse.json({
    users: page.map((profile) => ({
      ...profile,
      email: emailByUser!.get(profile.id) ?? "",
      role: roleByUser.get(profile.id) ?? "customer",
    })),
    totalCount: count ?? page.length,
    limit,
    offset,
  });
}

export async function PATCH(request: Request) {
  const actor = await getAuthContext();
  if (!actor || actor.status !== "active" || !isCeo(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = z
    .object({
      userId: z.string().uuid(),
      role: z.enum(roles).optional(),
      status: z.enum(statuses).optional(),
    })
    .strict()
    .refine((value) => value.role || value.status)
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const client = await createServerSupabaseClient();
  const { error } = await client.rpc("manage_account", {
    target: parsed.data.userId,
    new_role: parsed.data.role ?? null,
    new_status: parsed.data.status ?? null,
  });
  if (error)
    return NextResponse.json(
      { error: "Account update was not permitted or could not be saved." },
      { status: error.code === "42501" ? 403 : 400 },
    );

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const actor = await getAuthContext();
  if (!actor || actor.status !== "active" || !isCeo(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = z
    .object({ userId: z.string().uuid() })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const client = await createServerSupabaseClient();
  const { error: rpcError } = await client.rpc("delete_user_account", {
    target: parsed.data.userId,
  });
  if (rpcError)
    return NextResponse.json(
      {
        error: "Account deletion was not permitted or could not be completed.",
      },
      { status: rpcError.code === "42501" ? 403 : 400 },
    );

  return NextResponse.json({ ok: true });
}
