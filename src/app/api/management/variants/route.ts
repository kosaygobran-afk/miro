import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
  mapPriceConstraintError,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid(),
  sku: z.string().min(1).max(100),
  barcode: z.string().max(100).nullable().optional(),
  color_he: z.string().max(100).nullable().optional(),
  color_en: z.string().max(100).nullable().optional(),
  color_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  price_override: z.number().positive().nullable().optional(),
  cost_override: z.number().nonnegative().nullable().optional(),
  supplier_id: z.string().uuid().nullable().optional(),
  supplier_sku: z.string().max(100).nullable().optional(),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
  low_stock_threshold: z.number().int().nonnegative().default(0),
  reorder_point: z.number().int().nonnegative().nullable().optional(),
  reorder_qty: z.number().int().nonnegative().nullable().optional(),
});

// PATCH payload for public.update_variant(p_id, p_patch): exactly the RPC
// whitelist (reorder_point/reorder_qty are intentionally not editable there;
// unknown keys are rejected loudly instead of being silently dropped).
const variantPatchSchema = z
  .object({
    id: z.string().uuid(),
    product_id: z.string().uuid().optional(),
    sku: z.string().min(1).max(100).optional(),
    barcode: z.string().max(100).nullable().optional(),
    color_he: z.string().max(100).nullable().optional(),
    color_en: z.string().max(100).nullable().optional(),
    color_hex: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable()
      .optional(),
    price_override: z.number().positive().nullable().optional(),
    cost_override: z.number().nonnegative().nullable().optional(),
    supplier_id: z.string().uuid().nullable().optional(),
    supplier_sku: z.string().max(100).nullable().optional(),
    is_default: z.boolean().optional(),
    is_active: z.boolean().optional(),
    low_stock_threshold: z.number().int().nonnegative().optional(),
  })
  .strict();

function mapVariantRpcError(error: {
  code?: string;
  message?: string;
}): NextResponse {
  console.error("update_variant failed:", error.code, error.message);
  if (error.code === "42501") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (error.code === "23505") {
    return mapPostgresError(error);
  }
  if (error.code === "23514") {
    return mapPriceConstraintError(error);
  }
  if (error.code === "22023") {
    if ((error.message ?? "").includes("Variant not found")) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Invalid input", code: "invalid_input" },
      { status: 400 },
    );
  }
  return NextResponse.json({ error: "Operation failed" }, { status: 500 });
}

async function revalidateCatalog() {
  revalidatePath("/he");
  revalidatePath("/en");
  revalidatePath("/he/store/[category]", "page");
  revalidatePath("/en/store/[category]", "page");
  revalidatePath("/he/store/[category]/[slug]", "page");
  revalidatePath("/en/store/[category]/[slug]", "page");
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { admin } = auth;
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");

  let query = admin
    .from("product_variants")
    .select(
      `
      id, product_id, sku, barcode, color_he, color_en, color_hex,
      price_override, cost_override, supplier_id, supplier_sku,
      is_default, is_active, low_stock_threshold, reorder_point, reorder_qty,
      stock_qty, created_at, updated_at,
      suppliers (id, company_name)
    `,
    )
    .order("created_at", { ascending: false });

  if (productId) {
    query = query.eq("product_id", productId);
  }

  const { data, error: variantsError } = await query;

  if (variantsError) {
    return errorResponse(variantsError.message);
  }

  return NextResponse.json({ variants: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = variantSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const client = await createServerSupabaseClient();
  const { data: variant, error: variantError } = await client.rpc(
    "create_catalog_variant",
    { p_data: parsed.data },
  );

  if (variantError) {
    return mapPostgresError(variantError);
  }

  await revalidateCatalog();

  return NextResponse.json({ variant });
}

export async function PATCH(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = variantPatchSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, product_id: _productId, ...fields } = parsed.data;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) patch[key] = value;
  }
  if (Object.keys(patch).length === 0) {
    return errorResponse("Nothing to update", 400);
  }

  // One transactional call: field update, atomic default-flag flip (sibling
  // clearing + audit) and the last-sellable-variant unpublish trigger. The
  // RPC self-authorizes via active_app_role(), so it must run through the
  // user-context client (auth.uid()), not the service client.
  const client = await createServerSupabaseClient();
  const { data: variant, error: variantError } = await client.rpc(
    "update_variant",
    { p_id: id, p_patch: patch },
  );

  if (variantError) {
    return mapVariantRpcError(variantError);
  }

  await revalidateCatalog();

  return NextResponse.json({ variant });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return errorResponse("Valid variant ID required", 400);
  }

  // Keep the row and its stock/order references. update_variant writes the
  // metadata change and actor audit event in the same transaction.
  const client = await createServerSupabaseClient();
  const { error: updateError } = await client.rpc("update_variant", {
    p_id: id,
    p_patch: { is_active: false },
  });
  if (updateError) return mapVariantRpcError(updateError);

  await revalidateCatalog();

  return NextResponse.json({ ok: true, archived: true });
}
