import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const movementSchema = z.object({
  variantId: z.string().uuid(),
  delta: z
    .number()
    .int()
    .min(-10000)
    .max(10000)
    .refine((v) => v !== 0, "Delta must not be zero"),
  type: z.enum([
    "purchase_receipt",
    "sale",
    "customer_return",
    "supplier_return",
    "manual_adjustment",
    "damage",
    "loss",
    "stocktake_correction",
    "transfer_in",
    "transfer_out",
    "reservation",
    "reservation_release",
  ]),
  reference: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  unitCost: z.number().nonnegative().optional().nullable(),
});

const adjustSchema = z.object({
  variantId: z.string().uuid(),
  counted: z.number().int().nonnegative(),
  reason: z.string().min(1).max(500),
});

const inventoryListQuerySchema = z.object({
  // Legacy alias kept for existing callers: lowStock=true narrows to the
  // SQL-computed "low" stock state.
  lowStock: z.string().optional(),
  search: z.string().trim().max(120).optional().default(""),
  status: z
    .enum(["all", "in_stock", "low", "out_of_stock"])
    .optional()
    .default("all"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// Items returned by the management_inventory_list RPC (snake_case jsonb).
type InventoryListItem = {
  variant_id: string;
  sku: string;
  barcode: string | null;
  stock_qty: number;
  low_stock_threshold: number;
  reorder_point: number | null;
  reorder_qty: number | null;
  supplier_company_name: string | null;
  product_id: string;
  product_slug: string | null;
  product_name_he: string | null;
  product_name_en: string | null;
  status: string;
};

type InventoryListResult = {
  total_count: number;
  page: number;
  page_size: number;
  items: InventoryListItem[];
};

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageInventory");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const variantId = searchParams.get("variantId");

  const { admin } = auth;

  if (variantId) {
    const { data: movements, error } = await admin
      .from("stock_movements")
      .select(
        "id, delta, previous_qty, resulting_qty, type, reference, unit_cost, note, actor_id, created_at",
      )
      .eq("variant_id", variantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return mapPostgresError(error);
    return NextResponse.json({ movements: movements ?? [] });
  }

  const parsed = inventoryListQuerySchema.safeParse({
    ...Object.fromEntries(searchParams),
    search: searchParams.get("search") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
    lowStock: searchParams.get("lowStock") ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse("Invalid query params", 400, parsed.error.flatten());
  }

  const { search, status, limit, offset, lowStock } = parsed.data;
  // Note: management_inventory_list has no supplier/active/sort filters —
  // search + SQL stock state only (see migration 20260927110000).
  const rpcStatus =
    lowStock === "true"
      ? "low"
      : status === "in_stock"
        ? "in"
        : status === "out_of_stock"
          ? "out"
          : status === "low"
            ? "low"
            : null;

  // The RPC paginates by page; map limit/offset onto pages and trim the
  // leading rows when offset is not page-aligned.
  const page = Math.floor(offset / limit) + 1;

  // User-context client: the RPC authorizes via active_app_role(), which is
  // null under the service-role key.
  const client = await createServerSupabaseClient();
  const { data: result, error } = await client.rpc(
    "management_inventory_list",
    {
      p_search: search || null,
      p_status: rpcStatus,
      p_page: page,
      p_page_size: limit,
    },
  );
  if (error) return mapPostgresError(error);

  const payload = result as unknown as InventoryListResult;
  const trim = offset % limit;
  const items = (payload?.items ?? []).slice(trim);

  return NextResponse.json({
    items: items.map((item) => ({
      // Field names kept compatible with the inventory manager UI.
      id: item.variant_id,
      sku: item.sku,
      barcode: item.barcode,
      stock_qty: item.stock_qty,
      low_stock_threshold: item.low_stock_threshold,
      reorder_point: item.reorder_point,
      reorder_qty: item.reorder_qty,
      status: item.status,
      products: {
        id: item.product_id,
        slug: item.product_slug,
        name_he: item.product_name_he,
        name_en: item.product_name_en,
      },
      suppliers: item.supplier_company_name
        ? { company_name: item.supplier_company_name }
        : null,
    })),
    totalCount: payload?.total_count ?? 0,
    limit,
    offset,
  });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageInventory");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = movementSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const client = await createServerSupabaseClient();
  const { data: movementId, error } = await client.rpc(
    "record_stock_movement",
    {
      p_variant_id: parsed.data.variantId,
      p_delta: parsed.data.delta,
      p_type: parsed.data.type,
      p_reference: parsed.data.reference ?? null,
      p_note: parsed.data.note ?? null,
      p_unit_cost: parsed.data.unitCost ?? null,
    },
  );

  if (error) {
    if (error.code === "22023") {
      return NextResponse.json(
        { error: "Insufficient stock", code: "insufficient_stock" },
        { status: 400 },
      );
    }
    if (error.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("record_stock_movement failed:", error.code, error.message);
    return NextResponse.json(
      { error: "Failed to record stock movement" },
      { status: 500 },
    );
  }

  return NextResponse.json({ movementId });
}

export async function PATCH(request: Request) {
  const auth = await withManagementAuth(request, "manageInventory");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = adjustSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const client = await createServerSupabaseClient();
  const { data: movementId, error } = await client.rpc("adjust_stock", {
    p_variant_id: parsed.data.variantId,
    p_counted: parsed.data.counted,
    p_reason: parsed.data.reason,
  });

  if (error) {
    if (error.code === "22023") {
      const msg = error.message || "";
      if (msg.includes("No change")) {
        return NextResponse.json(
          { error: "No change in stock quantity" },
          { status: 400 },
        );
      }
      if (msg.includes("Variant not found")) {
        return NextResponse.json(
          { error: "Variant not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: "Invalid adjustment", code: "invalid_adjustment" },
        { status: 400 },
      );
    }
    if (error.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("adjust_stock failed:", error.code, error.message);
    return NextResponse.json(
      { error: "Failed to adjust stock" },
      { status: 500 },
    );
  }

  return NextResponse.json({ movementId });
}
