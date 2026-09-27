import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const saleItemSchema = z
  .object({
    variantId: z.string().uuid(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
    discountPerUnit: z.number().nonnegative().optional(),
    discount_per_unit: z.number().nonnegative().optional(),
  })
  .transform(({ discount_per_unit, discountPerUnit, ...rest }) => ({
    ...rest,
    discountPerUnit: discountPerUnit ?? discount_per_unit ?? 0,
  }))
  .refine((item) => item.discountPerUnit <= item.unitPrice, {
    message: "discountPerUnit must be between 0 and unitPrice",
  });

const saleSchema = z.object({
  customer: z
    .object({
      name: z.string().min(1).max(255),
      email: z.string().email(),
      phone: z.string().optional().nullable(),
      userId: z.string().uuid().optional().nullable(),
      customer_id: z.string().uuid().optional().nullable(),
    })
    .transform(({ userId, customer_id, ...rest }) => ({
      ...rest,
      userId: userId ?? customer_id ?? null,
    })),
  items: z.array(saleItemSchema).min(1),
});

const listParamsSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "recordSale");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsed = listParamsSchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return errorResponse("Invalid query params", 400, parsed.error.flatten());
  }

  const { admin } = auth;
  const { from, to, limit, offset } = parsed.data;

  // Check if user is CEO or admin (they see all orders with source='management' or all)
  // For now, all admin/ceo see all management-sourced orders
  let orderQuery = admin
    .from("orders")
    .select(
      `
      id, order_number, status, currency, customer_name, customer_email, customer_phone,
      user_id, source, subtotal, vat_total, total, net_total, shipping_cost, notes,
      created_at, updated_at,
      order_items (id, product_id, variant_id, quantity, unit_price, total_price,
        sku_snapshot, product_name_he, product_name_en, unit_cost, vat_rate,
        vat_amount, discount_amount, net_amount)
    `,
    )
    .eq("source", "management")
    .order("created_at", { ascending: false });

  if (from) {
    orderQuery = orderQuery.gte("created_at", from);
  }
  if (to) {
    orderQuery = orderQuery.lte("created_at", to);
  }

  const { data: orders, error: ordersError } = await orderQuery.range(
    offset,
    offset + limit - 1,
  );

  if (ordersError) {
    return errorResponse(ordersError.message);
  }

  let countQuery = admin
    .from("orders")
    .select("id", { count: "exact" })
    .eq("source", "management");
  if (from) countQuery = countQuery.gte("created_at", from);
  if (to) countQuery = countQuery.lte("created_at", to);

  const { count } = await countQuery;

  return NextResponse.json({
    orders: orders ?? [],
    totalCount: count ?? 0,
    limit,
    offset,
  });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "recordSale");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = saleSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const client = await createServerSupabaseClient();
  const { customer, items } = parsed.data;
  const { data: orderId, error } = await client.rpc("record_sale", {
    p_customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone ?? null,
      customer_id: customer.userId ?? null,
    },
    p_items: items.map((item) => ({
      variant_id: item.variantId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount_per_unit: item.discountPerUnit,
    })),
  });

  if (error) {
    if (error.code === "22023") {
      const msg = error.message || "";
      if (msg.includes("Insufficient stock")) {
        return NextResponse.json(
          { error: "Insufficient stock", code: "insufficient_stock" },
          { status: 400 },
        );
      }
      if (
        msg.includes("Product not active") ||
        msg.includes("Variant not active") ||
        msg.includes("Variant not found")
      ) {
        return NextResponse.json(
          { error: "Invalid product or variant", code: "invalid_product" },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "Invalid sale data", code: "invalid_sale_data" },
        { status: 400 },
      );
    }
    if (error.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("record_sale failed:", error.code, error.message);
    return NextResponse.json(
      { error: "Failed to record sale" },
      { status: 500 },
    );
  }

  return NextResponse.json({ orderId });
}
