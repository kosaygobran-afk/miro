import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { revalidatePath } from "next/cache";

const rolePriceSchema = z.object({
  product_id: z.string().uuid(),
  role: z.enum(["customer", "worker", "admin", "ceo"]),
  price: z.number().nonnegative(),
});

async function revalidateCatalog() {
  revalidatePath("/he/store");
  revalidatePath("/en/store");
  revalidatePath("/he/store/[category]", "page");
  revalidatePath("/en/store/[category]", "page");
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

  const { admin, actor } = auth;
  const { data, error: insertError } = await admin
    .from("product_prices")
    .upsert(parsed.data, { onConflict: "product_id,role" })
    .select()
    .single();

  if (insertError) {
    return mapPostgresError(insertError);
  }

  await admin.from("audit_events").insert({
    action: "product_price_set",
    user_id: actor.user.id,
    details: {
      product_id: parsed.data.product_id,
      role: parsed.data.role,
      price: parsed.data.price,
    },
    entity_type: "product_price",
    entity_id: parsed.data.product_id,
  });

  await revalidateCatalog();

  return NextResponse.json({ price: data });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const role = searchParams.get("role");

  if (!productId || !role) {
    return errorResponse("productId and role required", 400);
  }

  const { admin, actor } = auth;
  const { error: deleteError } = await admin
    .from("product_prices")
    .delete()
    .eq("product_id", productId)
    .eq("role", role);

  if (deleteError) {
    return mapPostgresError(deleteError);
  }

  await admin.from("audit_events").insert({
    action: "product_price_deleted",
    user_id: actor.user.id,
    details: { product_id: productId, role },
    entity_type: "product_price",
    entity_id: productId,
  });

  await revalidateCatalog();

  return NextResponse.json({ ok: true });
}
