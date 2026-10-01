import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const rolePriceSchema = z.object({
  product_id: z.string().uuid(),
  role: z.enum(["customer", "worker", "admin", "ceo"]),
  price: z.number().positive(),
});

async function revalidateCatalog() {
  revalidatePath("/he");
  revalidatePath("/en");
  revalidatePath("/he/store/[category]", "page");
  revalidatePath("/en/store/[category]", "page");
}

function mapPriceRpcError(error: {
  code?: string;
  message?: string;
}): NextResponse {
  console.error("upsert_product_price failed:", error.code, error.message);
  if (error.code === "42501") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (error.code === "22023") {
    const message = error.message ?? "";
    if (message.includes("Product not found")) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (message.includes("Price must be positive")) {
      return NextResponse.json(
        { error: "Price must be greater than 0" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Invalid input", code: "invalid_input" },
      { status: 400 },
    );
  }
  return NextResponse.json({ error: "Operation failed" }, { status: 500 });
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { admin } = auth;
  const { data, error: pricesError } = await admin
    .from("product_prices")
    .select("product_id, role, price, products (id, name_he, name_en)")
    .order("product_id");

  if (pricesError) {
    return errorResponse(pricesError.message);
  }

  return NextResponse.json({ prices: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = rolePriceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  // Transactional set/replace with audit (self-authorizing RPC: user context).
  const client = await createServerSupabaseClient();
  const { error: rpcError } = await client.rpc("upsert_product_price", {
    p_product_id: parsed.data.product_id,
    p_role: parsed.data.role,
    p_price: parsed.data.price,
  });

  if (rpcError) {
    return mapPriceRpcError(rpcError);
  }

  await revalidateCatalog();

  return NextResponse.json({ price: parsed.data });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const role = searchParams.get("role");

  const parsed = z
    .object({
      product_id: z.string().uuid(),
      role: z.enum(["customer", "worker", "admin", "ceo"]),
    })
    .safeParse({ product_id: productId, role });
  if (!parsed.success) {
    return errorResponse("productId and role required", 400);
  }

  // upsert_product_price with a NULL price removes the row (= not published
  // for this role) and audits product_price_removed in the same transaction.
  const client = await createServerSupabaseClient();
  const { error: rpcError } = await client.rpc("upsert_product_price", {
    p_product_id: parsed.data.product_id,
    p_role: parsed.data.role,
    p_price: null,
  });

  if (rpcError) {
    return mapPriceRpcError(rpcError);
  }

  await revalidateCatalog();

  return NextResponse.json({ ok: true });
}
