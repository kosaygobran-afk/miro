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
import { sanitizePosSaleBody } from "@/lib/pos-sale";
import {
  commerceFailure,
  commerceJson,
  readCommerceJson,
} from "@/lib/commerce/http";
import { MAX_AGOROT, sumAgorot, toAgorot } from "@/lib/commerce/money";

const moneySchema = z
  .number()
  .min(0)
  .max(MAX_AGOROT / 100)
  .refine((value) => {
    try {
      toAgorot(value);
      return true;
    } catch {
      return false;
    }
  }, "Money requires at most two decimal places");

const saleItemSchema = z
  .object({
    variantId: z.string().uuid(),
    quantity: z.number().int().positive().max(10_000),
    unitPrice: moneySchema,
    discountPerUnit: moneySchema.optional(),
    discount_per_unit: moneySchema.optional(),
  })
  .strict()
  .refine(
    (item) =>
      item.discountPerUnit === undefined ||
      item.discount_per_unit === undefined ||
      item.discountPerUnit === item.discount_per_unit,
    "Discount fields disagree",
  )
  .transform(({ discount_per_unit, discountPerUnit, ...rest }) => ({
    ...rest,
    discountPerUnit: discountPerUnit ?? discount_per_unit ?? 0,
  }))
  .refine((item) => item.discountPerUnit <= item.unitPrice, {
    message: "discountPerUnit must be between 0 and unitPrice",
  });

const paymentSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS),
    amount: moneySchema.refine((value) => value > 0),
    installments: z.number().int().min(1).max(36).default(1),
    reference: z.string().max(120).optional().nullable(),
  })
  .strict()
  .refine(
    (payment) => payment.method !== "cash" || payment.installments === 1,
    "Cash cannot use installments",
  );

const saleSchema = z
  .object({
    customer: z
      .object({
        name: z.string().trim().min(1).max(255),
        email: z.string().trim().email().max(254).optional().nullable(),
        phone: z.string().trim().max(30).optional().nullable(),
        userId: z.string().uuid().optional().nullable(),
      })
      .strict(),
    items: z.array(saleItemSchema).min(1).max(100),
    // Payments optional for backward compatibility; if omitted, a single cash payment for the full amount is created.
    // The business source is server-owned and always resolves to POS for this endpoint.
    payments: z.array(paymentSchema).min(1).max(100).optional(),
    idempotencyKey: z.string().min(8).max(64),
  })
  .strict();

const listParamsSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().nonnegative().max(1_000_000).default(0),
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

  const [{ data: orders, error: ordersError }, { count, error: countError }] =
    await Promise.all([
      orderQuery.range(offset, offset + limit - 1),
      countQuery,
    ]);

  if (ordersError || countError) {
    return commerceFailure(ordersError ?? countError, "pos_sales_history");
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
    if (profilesError)
      return commerceFailure(profilesError, "pos_sales_history_profiles");
    for (const profile of (profiles ?? []) as unknown as {
      id: string;
      display_name: string | null;
      full_name: string | null;
    }[]) {
      const displayName = profile.display_name || profile.full_name;
      if (displayName) recorderNames.set(profile.id, displayName);
    }
  }

  return commerceJson({
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

  let body: unknown;
  try {
    body = await readCommerceJson(request);
  } catch (error) {
    return commerceFailure(error, "record_pos_sale_input");
  }
  const sanitizedBody = sanitizePosSaleBody(body);
  const parsed = saleSchema.safeParse(sanitizedBody);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { customer, items, payments, idempotencyKey } = parsed.data;

  let orderTotalAgorot: number;
  try {
    orderTotalAgorot = sumAgorot(
      items.map(
        (item) =>
          (toAgorot(item.unitPrice) - toAgorot(item.discountPerUnit)) *
          item.quantity,
      ),
    );
    if (
      payments &&
      sumAgorot(payments.map((p) => toAgorot(p.amount))) !== orderTotalAgorot
    )
      return commerceJson(
        {
          error: "Payment total does not match order total",
          code: "payment_mismatch",
        },
        400,
      );
  } catch {
    return commerceJson(
      { error: "Invalid sale total", code: "invalid_sale_data" },
      400,
    );
  }

  // If payments not provided, create a single cash payment for the full amount (backward compatibility)
  const finalPayments = payments ?? [
    {
      method: "cash" as const,
      amount: orderTotalAgorot / 100,
      installments: 1,
      reference: null,
    },
  ];

  const client = await createServerSupabaseClient();
  const { data: saleResult, error } = await client.rpc("record_pos_sale", {
    p_customer: {
      name: customer.name,
      email: customer.email ?? null,
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
    p_payments: finalPayments.map((payment) => ({
      method: payment.method,
      amount: payment.amount,
      installments: payment.installments,
      external_reference: payment.reference,
    })),
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    if (error.code === "PT409")
      return commerceJson(
        {
          error:
            "Sale details changed or conflict with a previous request. Review before retrying.",
          code: "sale_conflict",
        },
        409,
      );
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
    return commerceFailure(error, "record_pos_sale");
  }

  const parsedResult = z
    .object({
      order_id: z.string().uuid(),
      order_number: z.string().min(1),
      source: z.literal("pos"),
      status: z.string().min(1),
    })
    .safeParse(saleResult);

  if (!parsedResult.success) {
    return commerceJson(
      {
        error: "Sale result requires reconciliation",
        code: "invalid_sale_result",
      },
      503,
    );
  }

  return commerceJson({
    orderId: parsedResult.data.order_id,
    order_number: parsedResult.data.order_number,
    source: parsedResult.data.source,
  });
}
