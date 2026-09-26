import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
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

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageInventory");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const lowStock = searchParams.get("lowStock") === "true";
  const search = searchParams.get("search") || "";
  const variantId = searchParams.get("variantId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

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
    if (error) return errorResponse(error.message);
    return NextResponse.json({ movements: movements ?? [] });
  }

  let query = admin
    .from("product_variants")
    .select(
      `
      id, sku, barcode, color_he, color_en, color_hex, price_override, cost_override,
      supplier_id, supplier_sku, is_default, is_active, stock_qty, low_stock_threshold,
      reorder_point, reorder_qty, created_at, updated_at,
      products!product_variants_product_id_fkey (id, name_he, name_en, slug, status, tracking_mode, out_of_stock_policy),
      suppliers (id, company_name)
    `,
    )
    .order("sku");

  if (search) {
    query = query.or(
      `sku.ilike.%${search}%,barcode.ilike.%${search}%,products.name_he.ilike.%${search}%,products.name_en.ilike.%${search}%`,
    );
  }

  const { data, error } = await query.range(offset, offset + limit - 1);

  if (error) {
    return errorResponse(error.message);
  }

  let variants = data ?? [];

  // Filter low stock in memory
  if (lowStock) {
    variants = variants.filter((v) => v.stock_qty <= v.low_stock_threshold);
  }

  return NextResponse.json({
    variants,
    totalCount: variants.length,
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
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ movementId });
}
