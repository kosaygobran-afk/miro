import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  checkManagementRateLimit,
  getClientIp,
} from "@/app/api/management/_shared";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const resolvedParams = await params;
  const auth = await withManagementAuth(request, "viewFinance");
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

  const parsed = z
    .object({
      orderId: z.string().uuid(),
    })
    .safeParse(resolvedParams);

  if (!parsed.success) {
    return errorResponse("Invalid order ID", 400, parsed.error.flatten());
  }

  const { orderId } = parsed.data;
  const { admin } = auth;

  const { data, error } = await admin
    .rpc("management_pos_account_detail", { p_order_id: orderId })
    .returns<{
      id: string;
      order_number: string;
      status: string;
      currency: string;
      customer_name: string;
      customer_email: string;
      customer_phone: string | null;
      user_id: string | null;
      recorded_by: string;
      source: string;
      subtotal: number;
      vat_total: number;
      total: number;
      net_total: number;
      shipping_cost: number | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
      items: Array<{
        id: string;
        product_id: string;
        variant_id: string;
        quantity: number;
        unit_price: number;
        total_price: number;
        sku_snapshot: string;
        product_name_he: string;
        product_name_en: string;
        unit_cost: number;
        vat_rate: number;
        vat_amount: number;
        discount_amount: number;
        net_amount: number;
      }>;
      payments: Array<{
        id: string;
        payment_method: string;
        amount: number;
        currency: string;
        installments: number;
        payment_status: string;
        external_reference: string | null;
        created_at: string;
      }>;
    }>();

  if (error) {
    return errorResponse("Unable to load POS account detail", 500);
  }

  if (!data) {
    return NextResponse.json(
      { error: "POS account not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(data);
}
