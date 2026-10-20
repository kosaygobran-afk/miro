import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import {
  PRODUCT_MEDIA_BUCKET,
  parseOwnedStorageObjectName,
} from "@/lib/image-safety";
import { validateProductImage } from "@/lib/product-image-processing";
import { downloadProductImage } from "@/lib/remote-product-image";

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;
  const parsed = z
    .object({ id: z.string().uuid(), image_url: z.string().min(1).max(2000) })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Invalid image reference", 400);
  const { admin, actor } = auth;
  const { data: existing, error } = await admin
    .from("product_images")
    .select("*")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (error) return mapPostgresError(error);
  if (!existing) return errorResponse("Image not found", 404);
  if (existing.image_url !== parsed.data.image_url)
    return errorResponse("The image changed. Refresh the gallery.", 409);
  if (!existing.original_image_url)
    return errorResponse(
      "No retained original is available for this image",
      422,
    );
  if (existing.image_url === existing.original_image_url)
    return NextResponse.json({ image: existing });

  // Check that the retained source still exists before replacing a working URL.
  // Legacy audit recovery may point at an external source; keep SSRF defenses.
  try {
    const owned = parseOwnedStorageObjectName(
      existing.original_image_url,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
    let bytes: Buffer;
    if (owned) {
      const { data, error: downloadError } = await admin.storage
        .from(PRODUCT_MEDIA_BUCKET)
        .download(owned);
      if (downloadError || !data || data.size > 5 * 1024 * 1024)
        return errorResponse("The retained original is unavailable", 410);
      bytes = Buffer.from(await data.arrayBuffer());
    } else {
      bytes = await downloadProductImage(existing.original_image_url);
    }
    await validateProductImage(bytes);
  } catch {
    return errorResponse("The retained original is unavailable", 410);
  }
  let result;
  try {
    result = await admin
      .from("product_images")
      .update({ image_url: existing.original_image_url })
      .eq("id", existing.id)
      .eq("image_url", existing.image_url)
      .eq("original_image_url", existing.original_image_url)
      .select()
      .maybeSingle();
  } catch {
    return NextResponse.json(
      {
        error: "Restore could not be confirmed. Refresh before retrying.",
        code: "image_write_uncertain",
      },
      { status: 503 },
    );
  }
  if (result.error) {
    if (
      ["", "PGRST000", "PGRST001", "PGRST002", "57014"].includes(
        result.error.code ?? "",
      )
    )
      return NextResponse.json(
        {
          error: "Restore could not be confirmed. Refresh before retrying.",
          code: "image_write_uncertain",
        },
        { status: 503 },
      );
    return mapPostgresError(result.error);
  }
  if (!result.data)
    return errorResponse("The image changed. Refresh the gallery.", 409);
  await admin.from("audit_events").insert({
    action: "product_image_original_restored",
    user_id: actor.user.id,
    entity_type: "product_image",
    entity_id: existing.id,
    details: {
      product_id: existing.product_id,
      image_id: existing.id,
      previous_image_url: existing.image_url,
      original_image_url: existing.original_image_url,
    },
  });
  for (const locale of ["he", "en"]) {
    revalidatePath(`/${locale}`);
    revalidatePath(`/${locale}/store`, "layout");
  }
  return NextResponse.json({ image: result.data });
}
