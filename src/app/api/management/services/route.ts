import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export const SERVICE_VISUAL_KINDS = [
  "camera_dome",
  "camera_bullet",
  "camera_ptz",
  "alarm",
  "intercom",
  "router",
  "network_switch",
  "cable",
  "lock",
  "server",
  "generic_security",
  "uploaded_image",
  "uploaded_svg",
] as const;

// Content sections are app-owned; keep the shape loosely validated (JSON
// object) — the RPC enforces "must be a JSON object".
const serviceSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Invalid slug"),
  name_he: z.string().min(1).max(255),
  name_en: z.string().min(1).max(255),
  short_description_he: z.string().max(1000).optional().nullable(),
  short_description_en: z.string().max(1000).optional().nullable(),
  description_he: z.string().max(20000).optional().nullable(),
  description_en: z.string().max(20000).optional().nullable(),
  visual_kind: z.enum(SERVICE_VISUAL_KINDS).optional(),
  image_url: z.string().trim().max(2000).optional().nullable(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
  seo_title_he: z.string().max(255).optional().nullable(),
  seo_title_en: z.string().max(255).optional().nullable(),
  seo_description_he: z.string().max(1000).optional().nullable(),
  seo_description_en: z.string().max(1000).optional().nullable(),
  content: z.record(z.string(), z.unknown()).optional(),
});

async function revalidateServices() {
  revalidatePath("/he/services");
  revalidatePath("/en/services");
  revalidatePath("/he/services/[slug]", "page");
  revalidatePath("/en/services/[slug]", "page");
}

function mapRpcError(rpcError: {
  code?: string;
  message?: string;
}): NextResponse {
  console.error("upsert_service failed:", rpcError.code, rpcError.message);
  if (rpcError.code === "42501") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (rpcError.code === "23505") {
    return NextResponse.json(
      { error: "duplicate_slug", code: "duplicate_slug" },
      { status: 409 },
    );
  }
  if (rpcError.code === "22023") {
    const message = rpcError.message ?? "";
    if (message.includes("Service not found")) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    // upsert_service raises only safe business messages for 22023.
    return NextResponse.json(
      { error: message || "Invalid input", code: "invalid_input" },
      { status: 400 },
    );
  }
  return NextResponse.json({ error: "Operation failed" }, { status: 500 });
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { admin } = auth;
  const { data, error: servicesError } = await admin
    .from("services")
    .select("*")
    .order("sort_order")
    .order("slug");

  if (servicesError) {
    return errorResponse(servicesError.message);
  }

  // Full rows: this GET shapes serve the public Services pages in wave 4 too.
  return NextResponse.json({ services: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = serviceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  // upsert_service is self-authorizing through active_app_role() and audits as
  // auth.uid(), so it must run on the user-context client, not service_role.
  const client = await createServerSupabaseClient();
  const { data: serviceId, error: rpcError } = await client.rpc(
    "upsert_service",
    { p_service: parsed.data },
  );

  if (rpcError) {
    return mapRpcError(rpcError);
  }

  const { data: service, error: fetchError } = await auth.admin
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .single();

  if (fetchError) {
    return mapPostgresError(fetchError);
  }

  await revalidateServices();

  return NextResponse.json({ service });
}

export async function PATCH(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = serviceSchema
    .partial()
    .extend({ id: z.string().uuid() })
    .safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const client = await createServerSupabaseClient();
  const { data: serviceId, error: rpcError } = await client.rpc(
    "upsert_service",
    { p_service: parsed.data },
  );

  if (rpcError) {
    return mapRpcError(rpcError);
  }

  const { data: service, error: fetchError } = await auth.admin
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .single();

  if (fetchError) {
    return mapPostgresError(fetchError);
  }

  await revalidateServices();

  return NextResponse.json({ service });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return errorResponse("Service ID required", 400);
  }

  // Soft-deactivate is the only supported delete path for services; the
  // public storefront reads is_active rows only, so this hides the page.
  const { admin, actor } = auth;
  const { data: service, error: deactivateError } = await admin
    .from("services")
    .update({ is_active: false })
    .eq("id", id)
    .select("id, slug")
    .single();

  if (deactivateError) {
    return mapPostgresError(deactivateError);
  }

  await admin.from("audit_events").insert({
    action: "service_deactivated",
    user_id: actor.user.id,
    details: { service_id: id, slug: service.slug },
    entity_type: "service",
    entity_id: id,
  });

  await revalidateServices();

  return NextResponse.json({ ok: true, deactivated: true });
}
