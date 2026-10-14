import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { can, type Capability } from "@/lib/permissions";
import { hasSameOrigin } from "@/lib/request-origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkManagementRateLimit,
  getClientIp,
} from "@/app/api/management/_shared";

export class CommerceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
  }
}

export function commerceJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function commerceFailure(error: unknown, operation: string) {
  if (error instanceof CommerceError)
    return commerceJson({ error: error.code, code: error.code }, error.status);
  const correlationId = randomUUID();
  console.error(
    JSON.stringify({
      event: "commerce_error",
      operation,
      correlation_id: correlationId,
    }),
  );
  return commerceJson(
    {
      error: "commerce_unavailable",
      code: "commerce_unavailable",
      correlation_id: correlationId,
    },
    503,
  );
}

export async function readBoundedBytes(
  request: Request,
  maxBytes = 65_536,
): Promise<Uint8Array<ArrayBuffer>> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes))
    throw new CommerceError("body_too_large", 413);
  if (!request.body) throw new CommerceError("invalid_input");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new CommerceError("body_too_large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export async function readBoundedBody(
  request: Request,
  maxBytes = 65_536,
): Promise<string> {
  const bytes = await readBoundedBytes(request, maxBytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CommerceError("invalid_input");
  }
}

export async function readCommerceJson(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.split(";")[0]
      .trim()
      .match(/^application\/json$/i)
  )
    throw new CommerceError("invalid_content_type", 415);
  try {
    return JSON.parse(await readBoundedBody(request));
  } catch (error) {
    if (error instanceof CommerceError) throw error;
    throw new CommerceError("invalid_input");
  }
}

export async function requireCommerceActor(
  request: Request,
  capability: Capability,
) {
  if (!["GET", "HEAD"].includes(request.method) && !hasSameOrigin(request))
    throw new CommerceError("forbidden", 403);
  const client = await createServerSupabaseClient();
  const actor = await getAuthContext(client);
  if (!actor || actor.status !== "active")
    throw new CommerceError("unauthorized", 401);
  if (!can(actor.role, capability)) throw new CommerceError("forbidden", 403);
  const rate = await checkManagementRateLimit(
    createAdminClient(),
    getClientIp(request),
  );
  if (rate !== "ok")
    throw new CommerceError(
      rate === "limited" ? "rate_limited" : "commerce_unavailable",
      rate === "limited" ? 429 : 503,
    );
  return { actor, client };
}

export function checkRpcError(
  error: { code?: string; message?: string } | null,
) {
  if (!error) return;
  // PostgreSQL's application-conflict code also covers reviewable business
  // failures. Return a closed vocabulary so callers can distinguish a rejected
  // quote from an uncertain existing operation without exposing diagnostics.
  const businessFailures: Record<string, [string, number]> = {
    "Insufficient available stock": ["insufficient_stock", 409],
    "Open cash shift required": ["cash_shift_required", 409],
    "Idempotency payload conflict": ["idempotency_conflict", 409],
    "Sale idempotency binding conflict": ["idempotency_conflict", 409],
    "Provider event key payload conflict": ["idempotency_conflict", 409],
    "Intent unavailable": ["intent_unavailable", 409],
    "Intent has been released": ["intent_unavailable", 409],
    "Tender allocations exceed intent total": [
      "tender_allocation_conflict",
      409,
    ],
    "POS price is not configured": ["price_unavailable", 400],
    "POS price or eligibility is unavailable": ["price_unavailable", 400],
    "Quote-only product cannot be checked out": ["quote_only", 400],
    "Variant unavailable": ["invalid_product", 400],
    "Variant not available at POS": ["invalid_product", 400],
    "Website checkout unavailable": ["invalid_product", 400],
  };
  const businessFailure =
    ["PT409", "22023"].includes(error.code ?? "") &&
    Object.hasOwn(businessFailures, error.message ?? "") &&
    businessFailures[error.message ?? ""];
  if (businessFailure)
    throw new CommerceError(businessFailure[0], businessFailure[1]);
  const codes: Record<string, [string, number]> = {
    PT409: ["revision_conflict", 409],
    "23505": ["duplicate_operation", 409],
    "42501": ["forbidden", 403],
    "22023": ["invalid_input", 400],
    "23514": ["invalid_input", 400],
    "23503": ["referenced_record_missing", 400],
    PGRST202: ["commerce_migration_required", 503],
    "42P01": ["commerce_migration_required", 503],
    "42883": ["commerce_migration_required", 503],
  };
  const [code, status] = codes[error.code ?? ""] ?? [
    "commerce_unavailable",
    503,
  ];
  throw new CommerceError(code, status);
}
