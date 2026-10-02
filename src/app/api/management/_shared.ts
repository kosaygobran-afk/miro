import { hasSameOrigin } from "@/lib/request-origin";
import { getAuthContext, type AuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, type Capability } from "@/lib/permissions";
import { NextResponse } from "next/server";

export type ManagementAuthResult =
  | {
      ok: true;
      actor: AuthContext;
      admin: ReturnType<typeof createAdminClient>;
    }
  | { ok: false; response: NextResponse };

export async function withManagementAuth(
  request: Request,
  capability: Capability,
): Promise<ManagementAuthResult> {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !hasSameOrigin(request)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const actor = await getAuthContext();
  if (!actor || actor.status !== "active") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  if (!can(actor.role, capability)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  try {
    const admin = createAdminClient();
    return { ok: true, actor, admin };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Management data is unavailable. Please contact the project administrator.",
          code: "management_configuration",
        },
        { status: 503 },
      ),
    };
  }
}

export function errorResponse(
  message: string,
  status: number = 500,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    details ? { error: message, details } : { error: message },
    { status },
  );
}

export function mapPostgresError(error: {
  code?: string;
  message?: string;
}): NextResponse {
  const code = error.code;
  if (code === "23505") {
    const msg = error.message ?? "";
    if (msg.includes("product_variants_sku_unique") || msg.includes("sku")) {
      return NextResponse.json({ error: "duplicate_sku" }, { status: 409 });
    }
    if (
      msg.includes("product_variants_barcode_unique") ||
      msg.includes("barcode")
    ) {
      return NextResponse.json({ error: "duplicate_barcode" }, { status: 409 });
    }
    if (msg.includes("product_variants_default_uniq")) {
      return NextResponse.json(
        { error: "duplicate_default_variant" },
        { status: 409 },
      );
    }
    if (msg.includes("suppliers") && msg.includes("company_name")) {
      return NextResponse.json(
        { error: "duplicate_supplier" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Duplicate value" }, { status: 409 });
  }
  if (code === "42501") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (code === "22023") {
    return NextResponse.json(
      { error: "Invalid input", code: "invalid_input" },
      { status: 400 },
    );
  }
  if (code === "23503") {
    return NextResponse.json(
      { error: "Referenced entity not found", code: "referenced_entity" },
      { status: 400 },
    );
  }
  console.error("Management API database error:", error.code, error.message);
  return NextResponse.json({ error: "Operation failed" }, { status: 500 });
}

// Check-constraint violations (23514) from the catalog price contract:
// raw constraint names stay server-side, clients get a safe business message.
export function mapPriceConstraintError(error: {
  code?: string;
  message?: string;
}): NextResponse {
  const message = error.message ?? "";
  console.error("Price constraint violation:", error.code, message);
  if (message.includes("compare_at")) {
    return NextResponse.json(
      { error: "Compare-at price must be greater than the sale price" },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { error: "Price must be greater than 0" },
    { status: 400 },
  );
}
