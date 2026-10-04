import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  checkManagementRateLimit,
  getClientIp,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { channelDbValues, PAYMENT_METHODS } from "@/lib/sales-channel";

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

const saleSchema = z
  .object({
    customer: z
      .object({
        name: z.string().min(1).max(255),
        email: z.string().email(),
        phone: z.string().optional().nullable(),
        userId: z.string().uuid().optional().nullable(),
      })
      .strict(),
    items: z.array(saleItemSchema).min(1),
    payments: z
      .array(
        z
          .object({
            method: z.enum(PAYMENT_METHODS),
            amount: z.number().nonnegative().max(999999999.99),
            installments: z.number().int().min(1).max(36).default(1),
            reference: z.string().max(120).optional().nullable(),
          })
          .strict(),
      )
      .min(1),
    idempotencyKey: z.string().min(8).max(64),
  })
  .strict();

const listParamsSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "recordSale");
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
    return NextResponse.json(
      { error: "Too many requests", code: "rate_limited" },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = listParamsSchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return errorResponse("Invalid query params", 400, parsed.error.flatten());
  }

  const { admin } = auth;
  const { from, to, limit, offset } = parsed.data;

  // Check if user is CEO or admin (they see all orders with source='management' or all)
  // For now, all admin/ceo see all management-sourced orders
  const posSources = channelDbValues("pos");
  let orderQuery = admin
    .from("orders")
    .select(
      `
      id, order_number, status, currency, customer_name, customer_email, customer_phone,
      user_id, recorded_by, source, subtotal, vat_total, total, net_total, shipping_cost, notes,
      created_at, updated_at,
      order_items (id, product_id, variant_id, quantity, unit_price, total_price,
        sku_snapshot, product_name_he, product_name_en, unit_cost, vat_rate,
        vat_amount, discount_amount, net_amount)
    `,
    )
    .in("source", posSources ?? [])
    .order("created_at", { ascending: false });

  if (from) {
    orderQuery = orderQuery.gte("created_at", from);
  }
  if (to) {
    orderQuery = orderQuery.lte("created_at", to);
  }

  let countQuery = admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("source", posSources ?? []);
  if (from) countQuery = countQuery.gte("created_at", from);
  if (to) countQuery = countQuery.lte("created_at", to);

  const [{ data: orders, error: ordersError }, { count }] = await Promise.all([
    orderQuery.range(offset, offset + limit - 1),
    countQuery,
  ]);

  if (ordersError) {
    return errorResponse(ordersError.message);
  }

  // recorded_by has no FK into public.profiles (it references auth.users), so
  // staff display names are resolved with one bounded lookup for the page,
  // mirroring the requests list assignee resolution.
  const orderRows = (orders ?? []) as unknown as {
    recorded_by: string | null;
  }[];
  const recorderIds = [
    ...new Set(
      orderRows
        .map((row) => row.recorded_by)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const recorderNames = new Map<string, string>();
  if (recorderIds.length > 0) {
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, display_name, full_name")
      .in("id", recorderIds);
    if (profilesError) return errorResponse(profilesError.message);
    for (const profile of (profiles ?? []) as unknown as {
      id: string;
      display_name: string | null;
      full_name: string | null;
    }[]) {
      const displayName = profile.display_name || profile.full_name;
      if (displayName) recorderNames.set(profile.id, displayName);
    }
  }

  return NextResponse.json({
    orders: orderRows.map((row) => ({
      ...row,
      recordedBy: row.recorded_by
        ? {
            id: row.recorded_by,
            displayName: recorderNames.get(row.recorded_by) ?? null,
          }
        : null,
    })),
    totalCount: count ?? 0,
    limit,
    offset,
  });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "recordSale");
  if (!auth.ok) return auth.response;

  // Rate limit management write endpoints per IP (same tiers as GET)
  const rateLimit = await checkManagementRateLimit(
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

  const body = await request.json().catch(() => null);
  const parsed = saleSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const client = await createServerSupabaseClient();
  const { customer, items, idempotencyKey } = parsed.data;
  const { data: orderId, error } = await client.rpc("record_pos_sale", {
    p_customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone ?? null,
      customer_id: customer.userId ?? null,
    },
    p_items: items.map(
      (item: {
        variantId: string;
        quantity: number;
        unitPrice: number;
        discountPerUnit: number;
      }) => ({
        variant_id: item.variantId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount_per_unit: item.discountPerUnit,
      }),
    ),
    p_payments: parsed.data.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount,
      installments: payment.installments,
      external_reference: payment.reference,
    })),
    p_idempotency_key: idempotencyKey,
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
      if (msg.includes("Payment total does not match order total")) {
        return NextResponse.json(
          {
            error: "Payment total does not match order total",
            code: "payment_mismatch",
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "Invalid sale data", code: "invalid_sale_data" },
        { status: 400 },
      );
    }
    if (error.code === "23505") {
      // Handle duplicate idempotency key
      return NextResponse.json(
        { error: "Idempotency key conflict", code: "idempotency_conflict" },
        { status: 409 },
      );
    }
    if (error.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("record_pos_sale failed:", error.code, error.message);
    return NextResponse.json(
      { error: "Failed to record sale" },
      { status: 500 },
    );
  }

  return NextResponse.json({ orderId });
}
