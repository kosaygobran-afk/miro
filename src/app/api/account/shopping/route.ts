import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { CommerceError, readBoundedBody } from "@/lib/commerce/http";
import { hasSameOrigin } from "@/lib/request-origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cartConfigurationKey } from "@/features/cart/cart-items";
import { cartItemSchema } from "@/features/cart/cart-validation";

const uuid = z.uuid();
const operationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cart"),
    changes: z
      .array(
        z.object({
          key: z.string().min(1).max(5000),
          item: cartItemSchema.nullable(),
        }),
      )
      .min(1)
      .max(250),
  }),
  z.object({
    action: z.literal("wishlist"),
    productId: uuid,
    saved: z.boolean(),
  }),
  z.object({
    action: z.literal("import"),
    id: uuid,
    data: z.object({
      cart: z.array(cartItemSchema).max(250),
      wishlist: z.array(uuid).max(250),
    }),
  }),
]);
const input = z.object({ owner: uuid, operation: operationSchema });

function respond(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function hasAuthCookie() {
  return (await cookies())
    .getAll()
    .some(({ name }) => /^sb-.*-auth-token(?:\.\d+)?$/.test(name));
}

export async function GET() {
  if (!(await hasAuthCookie())) return respond({ account: null });

  try {
    const client = await createServerSupabaseClient();
    const actor = await getAuthContext(client);
    if (!actor) return respond({ error: "shopping_unavailable" }, 503);
    if (actor.status !== "active") return respond({ account: null });
    const { data, error } = await client.rpc("customer_shopping", {
      p_owner: actor.user.id,
    });
    if (error) return respond({ error: "shopping_unavailable" }, 503);
    return respond({
      account: {
        id: actor.user.id,
        contact: {
          name: actor.profile?.full_name ?? "",
          email: actor.user.email ?? "",
          phone: actor.profile?.phone ?? "",
        },
      },
      data,
    });
  } catch {
    return respond({ error: "shopping_unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return respond({ error: "forbidden" }, 403);

  try {
    const parsed = input.safeParse(
      JSON.parse(await readBoundedBody(request, 1_048_576)),
    );
    if (!parsed.success) return respond({ error: "invalid_input" }, 400);

    if (!(await hasAuthCookie()))
      return respond({ error: "unauthorized" }, 401);
    const client = await createServerSupabaseClient();
    const actor = await getAuthContext(client);
    if (!actor) return respond({ error: "shopping_unavailable" }, 503);
    if (actor.status !== "active" || actor.user.id !== parsed.data.owner) {
      return respond({ error: "unauthorized" }, 401);
    }

    const { operation } = parsed.data;
    const args: Record<string, unknown> = { p_owner: actor.user.id };
    if (operation.action === "cart") {
      args.p_action = "cart";
      args.p_lines = Object.fromEntries(
        operation.changes.map(({ key, item }) => [
          item ? cartConfigurationKey(item) : key,
          item,
        ]),
      );
    } else if (operation.action === "import") {
      args.p_action = "import";
      args.p_import_id = operation.id;
      args.p_products = operation.data.wishlist;
      args.p_lines = Object.fromEntries(
        operation.data.cart.map((item) => [cartConfigurationKey(item), item]),
      );
    } else {
      args.p_action = operation.saved ? "save" : "remove";
      args.p_products = [operation.productId];
    }

    const { data, error } = await client.rpc("customer_shopping", args);
    if (error) return respond({ error: "shopping_unavailable" }, 503);
    return respond({ data });
  } catch (error) {
    if (error instanceof CommerceError || error instanceof SyntaxError) {
      return respond(
        { error: "invalid_input" },
        error instanceof CommerceError ? error.status : 400,
      );
    }
    return respond({ error: "shopping_unavailable" }, 503);
  }
}
