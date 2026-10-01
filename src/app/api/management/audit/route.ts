import { NextResponse } from "next/server";
import {
  withManagementAuth,
  errorResponse,
} from "@/app/api/management/_shared";

// Per-IP rate limiting for management read endpoints (tiered: 60/min, 300/hour)
async function checkManagementReadRateLimit(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
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
  const auth = await withManagementAuth(request, "viewAnalytics");
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

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const action = searchParams.get("action");
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const { admin } = auth;
  let query = admin
    .from("audit_events")
    .select("id, action, user_id, details, created_at, entity_type, entity_id")
    .order("created_at", { ascending: false });

  if (userId) {
    query = query.eq("user_id", userId);
  }
  if (action) {
    query = query.eq("action", action);
  }
  if (entityType) {
    query = query.eq("entity_type", entityType);
  }
  if (entityId) {
    query = query.eq("entity_id", entityId);
  }

  const { data, error: auditError } = await query.range(
    offset,
    offset + limit - 1,
  );

  if (auditError) {
    return errorResponse(auditError.message);
  }

  const userIds = [
    ...new Set((data ?? []).map((event) => event.user_id).filter(Boolean)),
  ];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] };
  const nameByUser = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.full_name]),
  );

  const events = (data ?? []).map((event) => ({
    ...event,
    profiles: {
      full_name: event.user_id ? (nameByUser.get(event.user_id) ?? null) : null,
    },
  }));

  let countQuery = admin.from("audit_events").select("id", { count: "exact" });
  if (userId) {
    countQuery = countQuery.eq("user_id", userId);
  }
  if (action) {
    countQuery = countQuery.eq("action", action);
  }
  if (entityType) {
    countQuery = countQuery.eq("entity_type", entityType);
  }
  if (entityId) {
    countQuery = countQuery.eq("entity_id", entityId);
  }

  const { count } = await countQuery;

  return NextResponse.json({
    auditEvents: events,
    totalCount: count ?? 0,
    limit,
    offset,
  });
}
