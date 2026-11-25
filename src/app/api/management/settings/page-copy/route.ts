import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  mapPostgresError,
  withManagementAuth,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { websitePageCopySchema } from "@/lib/website-page-copy";
import { PUBLIC_WEBSITE_PAGE_COPY_TAG } from "@/lib/website-page-copy-server";

const bodySchema = z.strictObject({
  copy: websitePageCopySchema,
  revision: z.iso.datetime({ offset: true }),
});

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewFinance");
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.admin
    .from("business_settings")
    .select("value, updated_at")
    .eq("key", "website_page_copy")
    .maybeSingle();
  if (error) return mapPostgresError(error);
  const copy = websitePageCopySchema.safeParse(data?.value);
  if (!data || !copy.success) {
    return errorResponse("Saved page text is unavailable", 503);
  }
  return NextResponse.json(
    { copy: copy.data, revision: data.updated_at },
    { headers },
  );
}

export async function PUT(request: Request) {
  const auth = await withManagementAuth(request, "manageSettings");
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Invalid website page text", 400);

  const { copy, revision } = parsed.data;
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("update_website_page_copy", {
    p_value: copy,
    p_revision: revision,
  });
  if (error?.code === "PT409") {
    return errorResponse(
      "Website page text changed. Reload the saved text.",
      409,
    );
  }
  if (error?.code === "PT503" || error?.code === "PGRST202") {
    return errorResponse("Saved page text is unavailable", 503);
  }
  if (error) return mapPostgresError(error);

  revalidateTag(PUBLIC_WEBSITE_PAGE_COPY_TAG, { expire: 0 });
  revalidatePath("/[locale]", "page");
  for (const path of ["home", "services", "about", "contact"]) {
    revalidatePath(`/[locale]/${path}`, "page");
  }
  return NextResponse.json({ copy, revision: data }, { headers });
}
