import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  checkManagementRateLimit,
  getClientIp,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { evaluateExpression, CalculatorError } from "@/lib/calculator";

export const dynamic = "force-dynamic";

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
  const parsed = z
    .object({
      limit: z.coerce.number().int().positive().max(50).default(20),
    })
    .safeParse(Object.fromEntries(searchParams));

  if (!parsed.success) {
    return errorResponse("Invalid query params", 400, parsed.error.flatten());
  }

  const { limit } = parsed.data;
  const { admin } = auth;

  const { data, error } = await admin
    .rpc("get_calculator_history", { p_limit: limit })
    .returns<
      {
        id: string;
        expression: string;
        result: number;
        context_path: string | null;
        created_at: string;
      }[]
    >();

  if (error) {
    return errorResponse("Unable to load calculator history", 500);
  }

  return NextResponse.json({
    history: data,
    limit,
  });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "recordSale");
  if (!auth.ok) return auth.response;

  // Rate limit management write endpoints per IP
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
      expression: z.string().min(1).max(200),
      contextPath: z.string().max(200).optional().nullable(),
    })
    .strict()
    .safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { expression, contextPath } = parsed.data;

  // Server-side calculation - never trust client-supplied result
  let result: number;
  try {
    result = evaluateExpression(expression);
  } catch (err) {
    if (err instanceof CalculatorError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Invalid expression", code: "invalid_expression" },
      { status: 400 },
    );
  }

  const client = await createServerSupabaseClient();
  const { data: historyId, error } = await client.rpc(
    "record_calculator_history",
    {
      p_expression: expression,
      p_result: result,
      p_context_path: contextPath ?? null,
    },
  );

  if (error) {
    return errorResponse("Failed to record calculator history", 500);
  }

  return NextResponse.json({
    result,
    historyId: historyId ?? undefined,
  });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "recordSale");
  if (!auth.ok) return auth.response;

  // Rate limit management write endpoints per IP
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

  const client = await createServerSupabaseClient();
  const { data: deletedCount, error } = await client.rpc(
    "clear_calculator_history",
  );

  if (error) {
    return errorResponse("Failed to clear calculator history", 500);
  }

  return NextResponse.json({
    deletedCount: deletedCount ?? 0,
  });
}
