import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  errorResponse,
  mapPostgresError,
  withManagementAuth,
} from "@/app/api/management/_shared";
import { animationSettingsSchema } from "@/lib/animation-settings";
import { appearancePresetSchema } from "@/lib/appearance-presets";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewFinance");
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.admin
    .from("business_settings")
    .select("key, value, updated_at")
    .in("key", ["animation_settings", "appearance_version_1_backup"]);
  if (error) return mapPostgresError(error);
  const current = data?.find((row) => row.key === "animation_settings");
  const backup = appearancePresetSchema.safeParse(
    data?.find((row) => row.key === "appearance_version_1_backup")?.value,
  );
  const parsed = animationSettingsSchema.safeParse(current?.value);
  if (!parsed.success || !backup.success || !current?.updated_at) {
    return errorResponse(
      "Animation settings are unavailable. Apply the animation and appearance backup migrations.",
      503,
    );
  }
  return NextResponse.json(
    {
      settings: parsed.data,
      revision: current.updated_at,
      editable: auth.actor.role === "ceo",
      versionOneBackup: backup.data,
    },
    {
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function PUT(request: Request) {
  // Includes active-account and same-origin checks; SQL repeats the CEO check.
  const auth = await withManagementAuth(request, "manageSettings");
  if (!auth.ok) return auth.response;
  if (auth.actor.role !== "ceo") return errorResponse("CEO required", 403);
  const parsed = z
    .object({
      settings: animationSettingsSchema,
      revision: z.string().datetime({ offset: true }),
    })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return errorResponse(
      "Invalid animation settings",
      400,
      parsed.error.flatten(),
    );
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("update_animation_settings", {
    p_value: parsed.data.settings,
    p_revision: parsed.data.revision,
  });
  if (error?.code === "PT409")
    return errorResponse(
      "Animation settings changed. Reload the saved version before saving.",
      409,
    );
  if (error) return mapPostgresError(error);
  revalidatePath("/he", "layout");
  revalidatePath("/en", "layout");
  return NextResponse.json({
    settings: parsed.data.settings,
    revision: data,
    editable: true,
  });
}
