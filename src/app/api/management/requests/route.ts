import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

const REQUEST_STATUSES = [
  "new",
  "in_progress",
  "waiting_customer",
  "closed",
  "spam",
] as const;

const listQuerySchema = z.object({
  status: z
    .enum(["all", ...REQUEST_STATUSES])
    .optional()
    .default("all"),
  assigned: z
    .union([z.enum(["any", "unassigned"]), z.string().uuid()])
    .optional()
    .default("any"),
  source: z.string().trim().max(64).optional(),
  productId: z.string().uuid().optional(),
  locale: z.enum(["he", "en"]).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(REQUEST_STATUSES),
  // Optional: when omitted the current assignment is preserved; explicit
  // null unassigns. Routed to the RPC's `worker` argument (the canonical
  // staff assignee column since the requests unification migration).
  assignedTo: z.string().uuid().nullable().optional(),
});

type ServiceRequestRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: string;
  source: string;
  locale: string | null;
  metadata: Json;
  created_at: string;
  customer_id: string | null;
  assigned_to: string | null;
  product: {
    id: string;
    name_he: string;
    name_en: string;
  } | null;
  variant: {
    id: string;
    sku: string;
    color_he: string | null;
    color_en: string | null;
    color_hex: string | null;
  } | null;
};

// Strip characters that would break the PostgREST filter-grammar when a
// free-text term is embedded in an or()/ilike expression.
function filterSafeTerm(term: string): string {
  return term.replace(/[%,()"]/g, "");
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageRequests");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    ...Object.fromEntries(searchParams),
    status: searchParams.get("status") ?? undefined,
    assigned: searchParams.get("assigned") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse("Invalid query params", 400, parsed.error.flatten());
  }

  const {
    status,
    assigned,
    source,
    productId,
    locale,
    dateFrom,
    dateTo,
    q,
    limit,
    offset,
  } = parsed.data;
  const { admin } = auth;

  // One root query embeds product + variant; assignee display names come
  // from a single profiles lookup for the page (no FK exists to auth.users,
  // so this join cannot be embedded).
  let query = admin
    .from("service_requests")
    .select(
      `
      id, name, email, phone, message, status, source, locale, metadata,
      created_at, customer_id, assigned_to,
      product:products (id, name_he, name_en),
      variant:product_variants (id, sku, color_he, color_en, color_hex)
    `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (status !== "all") query = query.eq("status", status);
  if (assigned === "unassigned") query = query.is("assigned_to", null);
  else if (assigned !== "any") query = query.eq("assigned_to", assigned);
  if (source) query = query.eq("source", source);
  if (productId) query = query.eq("product_id", productId);
  if (locale) query = query.eq("locale", locale);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", dateTo);

  // Free text across contact fields + message + variant SKU. SKU lives on
  // the embedded variant, so matching variant ids are resolved in one
  // bounded lookup first.
  const term = q ? filterSafeTerm(q.trim()) : "";
  if (term) {
    const orParts = [
      `name.ilike."%${term}%"`,
      `email.ilike."%${term}%"`,
      `phone.ilike."%${term}%"`,
      `message.ilike."%${term}%"`,
    ];
    const { data: skuMatches, error: skuError } = await admin
      .from("product_variants")
      .select("id")
      .ilike("sku", `%${term}%`)
      .limit(50);
    if (skuError) return mapPostgresError(skuError);
    const variantIds = (skuMatches ?? [])
      .map((row) => (row as { id: string }).id)
      .filter(Boolean);
    if (variantIds.length > 0) {
      orParts.push(`variant_id.in.(${variantIds.join(",")})`);
    }
    query = query.or(orParts.join(","));
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) return mapPostgresError(error);

  const rows = (data ?? []) as unknown as ServiceRequestRow[];

  const assigneeIds = [
    ...new Set(
      rows
        .map((row) => row.assigned_to)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const assigneeNames = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, display_name, full_name")
      .in("id", assigneeIds);
    if (profilesError) return mapPostgresError(profilesError);
    for (const profile of (profiles ?? []) as unknown as {
      id: string;
      display_name: string | null;
      full_name: string | null;
    }[]) {
      const displayName = profile.display_name || profile.full_name;
      if (displayName) assigneeNames.set(profile.id, displayName);
    }
  }

  return NextResponse.json({
    rows: rows.map((row) => ({
      id: row.id,
      customer: {
        id: row.customer_id,
        name: row.name,
        email: row.email,
        phone: row.phone,
      },
      source: row.source,
      locale: row.locale,
      created_at: row.created_at,
      message: row.message,
      status: row.status,
      metadata: row.metadata,
      product: row.product,
      variant: row.variant,
      assignedTo: row.assigned_to
        ? {
            id: row.assigned_to,
            displayName: assigneeNames.get(row.assigned_to) ?? null,
          }
        : null,
    })),
    totalCount: count ?? 0,
    limit,
    offset,
  });
}

export async function PATCH(request: Request) {
  const auth = await withManagementAuth(request, "manageRequests");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { id, status, assignedTo } = parsed.data;

  // The RPC rewrites assigned_to from its `worker` argument on every
  // admin/CEO call, so an omitted assignee must not silently clear the
  // current one.
  let assignee = assignedTo;
  if (assignee === undefined) {
    const { data: current, error: readError } = await auth.admin
      .from("service_requests")
      .select("assigned_to")
      .eq("id", id)
      .maybeSingle();
    if (readError) return mapPostgresError(readError);
    if (!current) {
      return errorResponse("Request not found", 404);
    }
    assignee = (current as { assigned_to: string | null }).assigned_to;
  }

  // User-context client: update_service_request authorizes via
  // active_app_role(), which is null under the service-role key.
  const client = await createServerSupabaseClient();
  const { error } = await client.rpc("update_service_request", {
    target: id,
    new_status: status,
    worker: assignee,
  });
  if (error) return mapPostgresError(error);

  return NextResponse.json({ ok: true });
}
