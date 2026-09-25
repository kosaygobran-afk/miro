import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";

const supplierSchema = z.object({
  id: z.string().uuid().optional(),
  company_name: z.string().min(1).max(255),
  contact_person: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable().optional(),
  notes: z.string().optional().nullable(),
  default_lead_time_days: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().default("ILS"),
  is_active: z.boolean().default(true),
});

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { admin } = auth;
  const { data, error } = await admin
    .from("suppliers")
    .select("*")
    .order("company_name");

  if (error) {
    return errorResponse(error.message);
  }

  return NextResponse.json({ suppliers: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;
  const { data: supplier, error } = await admin
    .from("suppliers")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    return mapPostgresError(error);
  }

  await admin.from("audit_events").insert({
    action: "supplier_created",
    user_id: actor.user.id,
    details: { supplier_id: supplier.id, company_name: supplier.company_name },
    entity_type: "supplier",
    entity_id: supplier.id,
  });

  return NextResponse.json({ supplier });
}

export async function PATCH(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = supplierSchema
    .partial()
    .extend({ id: z.string().uuid() })
    .safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;
  const { id, ...updateData } = parsed.data;

  const { data: supplier, error } = await admin
    .from("suppliers")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return mapPostgresError(error);
  }

  await admin.from("audit_events").insert({
    action: "supplier_updated",
    user_id: actor.user.id,
    details: { supplier_id: supplier.id, company_name: supplier.company_name },
    entity_type: "supplier",
    entity_id: supplier.id,
  });

  return NextResponse.json({ supplier });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return errorResponse("Supplier ID required", 400);
  }

  const { admin, actor } = auth;

  // Check if any products or variants reference this supplier
  const [{ count: productsCount }, { count: variantsCount }] =
    await Promise.all([
      admin
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("supplier_id", id),
      admin
        .from("product_variants")
        .select("id", { count: "exact", head: true })
        .eq("supplier_id", id),
    ]);

  if ((productsCount ?? 0) > 0 || (variantsCount ?? 0) > 0) {
    // Soft delete: set is_active = false
    const { data: supplier, error } = await admin
      .from("suppliers")
      .update({ is_active: false })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return mapPostgresError(error);
    }

    await admin.from("audit_events").insert({
      action: "supplier_deactivated",
      user_id: actor.user.id,
      details: {
        supplier_id: id,
        company_name: supplier.company_name,
        reason: "referenced_by_products",
      },
      entity_type: "supplier",
      entity_id: id,
    });

    return NextResponse.json({ ok: true, deactivated: true });
  }

  // Hard delete: no references
  const { error } = await admin.from("suppliers").delete().eq("id", id);

  if (error) {
    return mapPostgresError(error);
  }

  await admin.from("audit_events").insert({
    action: "supplier_deleted",
    user_id: actor.user.id,
    details: { supplier_id: id },
    entity_type: "supplier",
    entity_id: id,
  });

  return NextResponse.json({ ok: true });
}
