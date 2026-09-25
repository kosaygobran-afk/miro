import { hasSameOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { z } from "zod";

const savedProductSchema = z.object({
  productId: z.string().uuid(),
});

export async function GET() {
  const actor = await getAuthContext();
  if (!actor || actor.status !== "active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("saved_products")
    .select(
      `
      product_id,
      created_at,
      products (
        id,
        name_he,
        name_en,
        short_description_he,
        short_description_en,
        price,
        image_url,
        category_id,
        is_featured,
        categories (
          slug,
          name_he,
          name_en
        )
      )
    `,
    )
    .eq("user_id", actor.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Unable to load saved products" },
      { status: 500 },
    );
  }

  return NextResponse.json({ savedProducts: data ?? [] });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actor = await getAuthContext();
  if (!actor || actor.status !== "active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = savedProductSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const client = await createServerSupabaseClient();
  const { error } = await client
    .from("saved_products")
    .insert({
      user_id: actor.user.id,
      product_id: parsed.data.productId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Product already saved" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Unable to save product" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actor = await getAuthContext();
  if (!actor || actor.status !== "active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsedId = z.string().uuid().safeParse(searchParams.get("productId"));
  if (!parsedId.success) {
    return NextResponse.json({ error: "Product ID required" }, { status: 400 });
  }
  const productId = parsedId.data;

  const client = await createServerSupabaseClient();
  const { error } = await client
    .from("saved_products")
    .delete()
    .eq("user_id", actor.user.id)
    .eq("product_id", productId);

  if (error) {
    return NextResponse.json(
      { error: "Unable to remove saved product" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
