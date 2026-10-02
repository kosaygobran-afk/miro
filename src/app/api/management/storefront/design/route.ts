import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { storefrontDesignSchema } from "@/lib/storefront-design";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.admin
    .from("business_settings")
    .select("value, updated_at")
    .eq("key", "storefront_design")
    .maybeSingle();
  if (error) return mapPostgresError(error);
  const parsed = storefrontDesignSchema.safeParse(data?.value);
  if (!parsed.success)
    return errorResponse(
      "Store design configuration is unavailable. Apply the storefront design migration.",
      503,
    );
  return NextResponse.json({
    design: parsed.data,
    revision: data!.updated_at,
    editable: auth.actor.role === "ceo",
  });
}
export async function PUT(request: Request) {
  const auth = await withManagementAuth(request, "manageSettings");
  if (!auth.ok) return auth.response;
  const parsed = z
    .object({
      design: storefrontDesignSchema,
      revision: z.string().datetime({ offset: true }),
    })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return errorResponse(
      "Invalid design configuration",
      400,
      parsed.error.flatten(),
    );
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("update_storefront_design", {
    p_value: parsed.data.design,
    p_revision: parsed.data.revision,
  });
  if (error?.code === "PT409" || error?.code === "40001")
    return errorResponse(
      "Someone else changed this design. Reload before saving.",
      409,
    );
  if (error) return mapPostgresError(error);
  revalidatePath("/he", "layout");
  revalidatePath("/en", "layout");
  return NextResponse.json({ design: parsed.data.design, revision: data });
}
