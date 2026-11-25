import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import {
  errorResponse,
  mapPostgresError,
  withManagementAuth,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { websiteImagesSchema } from "@/lib/website-images";
import {
  parseStoredWebsiteImages,
  PUBLIC_WEBSITE_IMAGES_TAG,
} from "@/lib/website-images-server";

const bodySchema = z
  .object({
    design: websiteImagesSchema,
    revision: z.iso.datetime({ offset: true }),
  })
  .strict();
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageSettings");
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.admin
    .from("business_settings")
    .select("value, updated_at")
    .eq("key", "website_images")
    .maybeSingle();
  if (error) return mapPostgresError(error);
  const parsed = parseStoredWebsiteImages(data?.value);
  if (!data || !parsed.success) {
    return errorResponse(
      "Website image settings are unavailable. Verify the website images migration and saved design.",
      503,
    );
  }
  return NextResponse.json(
    { design: parsed.data, revision: data.updated_at },
    { headers },
  );
}

export async function PUT(request: Request) {
  const auth = await withManagementAuth(request, "manageSettings");
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(
      "Invalid website image settings",
      400,
      parsed.error.flatten(),
    );
  }
  const { design, revision } = parsed.data;
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("update_website_images", {
    p_value: design,
    p_revision: revision,
  });
  if (error?.code === "PT409") {
    return errorResponse(
      "Website images changed. Reload the saved version before saving.",
      409,
    );
  }
  if (error?.code === "PT503" || error?.code === "PGRST202") {
    return errorResponse(
      "Website image settings are unavailable. Apply the website images migration.",
      503,
    );
  }
  if (error) return mapPostgresError(error);

  revalidateTag(PUBLIC_WEBSITE_IMAGES_TAG, { expire: 0 });
  revalidatePath("/[locale]/home", "page");
  revalidatePath("/[locale]/services", "layout");
  return NextResponse.json({ design, revision: data }, { headers });
}
