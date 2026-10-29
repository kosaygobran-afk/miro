import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import {
  errorResponse,
  mapPostgresError,
  withManagementAuth,
} from "@/app/api/management/_shared";
import {
  glassSettingsSchema,
  PUBLIC_GLASS_SETTINGS_TAG,
} from "@/lib/glass-settings";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rememberPublicGlassSettings } from "@/lib/glass-settings-server";

const bodySchema = z
  .object({
    settings: glassSettingsSchema,
    revision: z.string().datetime({ offset: true }),
  })
  .strict();
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewFinance");
  if (!auth.ok) return auth.response;
  if (auth.actor.role !== "ceo" && auth.actor.role !== "admin")
    return errorResponse("Management required", 403);
  const { data, error } = await auth.admin
    .from("business_settings")
    .select("value, updated_at")
    .eq("key", "glass_settings")
    .maybeSingle();
  if (error) return mapPostgresError(error);
  const parsed = glassSettingsSchema.safeParse(data?.value);
  if (!parsed.success || !data?.updated_at)
    return errorResponse(
      "Global glass settings are unavailable. Apply the glass settings migration.",
      503,
    );
  // Reconciliation after an uncertain save is also an authoritative read.
  rememberPublicGlassSettings({
    enabled: parsed.data.enabled,
    revision: data.updated_at,
  });
  return NextResponse.json(
    { settings: parsed.data, revision: data.updated_at, editable: true },
    { headers },
  );
}

export async function PUT(request: Request) {
  // This one appearance setting explicitly permits active CEO AND admin. Keep
  // manageSettings/animation permissions unchanged; SQL repeats this scope.
  const auth = await withManagementAuth(request, "viewFinance");
  if (!auth.ok) return auth.response;
  if (auth.actor.role !== "ceo" && auth.actor.role !== "admin")
    return errorResponse("Management required", 403);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return errorResponse("Invalid glass settings", 400, parsed.error.flatten());
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("update_glass_settings", {
    p_value: parsed.data.settings,
    p_revision: parsed.data.revision,
  });
  if (error?.code === "PT409")
    return errorResponse(
      "Glass settings changed. Reload the saved version before saving.",
      409,
    );
  if (error) return mapPostgresError(error);
  rememberPublicGlassSettings({
    enabled: parsed.data.settings.enabled,
    revision: data,
  });
  revalidateTag(PUBLIC_GLASS_SETTINGS_TAG, { expire: 0 });
  revalidatePath("/he", "layout");
  revalidatePath("/en", "layout");
  return NextResponse.json(
    { settings: parsed.data.settings, revision: data, editable: true },
    { headers },
  );
}
