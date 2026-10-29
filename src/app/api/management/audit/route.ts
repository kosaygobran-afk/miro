import {
  auditFiltersSchema,
  auditSearchExpression,
  israelDayStart,
} from "@/lib/management-audit";
import { NextResponse } from "next/server";
import {
  withManagementAuth,
  errorResponse,
  tooManyRequests,
  checkManagementRateLimit,
  getClientIp,
} from "@/app/api/management/_shared";

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewAnalytics");
  if (!auth.ok) return auth.response;

  // Rate limit management read endpoints per IP
  const rateLimit = await checkManagementRateLimit(
    auth.admin,
    getClientIp(request),
  );
  if (rateLimit === "error") {
    return errorResponse("Unable to process request", 503);
  }
  if (rateLimit === "limited") {
    return tooManyRequests();
  }

  const { searchParams } = new URL(request.url);
  const parsed = auditFiltersSchema.safeParse(
    Object.fromEntries([...searchParams].filter(([, value]) => value !== "")),
  );
  if (!parsed.success) return errorResponse("Invalid audit filters", 400);
  const { userId, action, entityType, entityId, from, to, q, limit, offset } =
    parsed.data;
  const { admin } = auth;
  let query = admin
    .from("audit_events")
    .select(
      "id, action, user_id, details, created_at, entity_type, entity_id",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (userId) query = query.eq("user_id", userId);
  if (action) query = query.eq("action", action);
  if (entityType) query = query.eq("entity_type", entityType);
  if (entityId) query = query.eq("entity_id", entityId);
  if (from) query = query.gte("created_at", israelDayStart(from));
  if (to) query = query.lt("created_at", israelDayStart(to, true));
  if (q) query = query.or(auditSearchExpression(q));
  const {
    data,
    count,
    error: auditError,
  } = await query.range(offset, offset + limit - 1);
  if (auditError) return errorResponse("Unable to load audit history");

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

  return NextResponse.json({
    auditEvents: events,
    totalCount: count ?? 0,
    limit,
    offset,
  });
}
