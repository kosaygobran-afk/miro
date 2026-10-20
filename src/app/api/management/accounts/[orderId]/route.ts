import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  withManagementAuth,
  errorResponse,
  checkManagementRateLimit,
  getClientIp,
  tooManyRequests,
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
    return tooManyRequests();
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
  const client = await createServerSupabaseClient();

  const { data, error } = await client
    .rpc("management_pos_account_detail", { p_order_id: orderId })
    .returns<{
      order: Record<string, unknown>;
      order_items: Record<string, unknown>[];
      order_payments: Record<string, unknown>[];
      stock_movements: Record<string, unknown>[];
    }>();

  if (error) {
    if (error.code === "P0002") {
      return errorResponse("POS account not found", 404);
    }
    return errorResponse("Unable to load POS account detail", 500);
  }

  if (!data) {
    return NextResponse.json(
      { error: "POS account not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
