import { z } from "zod";
import type { Capability } from "@/lib/permissions";
import { commerceReadiness } from "@/lib/commerce/config";
import {
  commerceSections,
  commerceActionSchemas,
  actionSections,
  type CommerceAction,
} from "@/lib/commerce/validation";
import {
  CommerceError,
  commerceFailure,
  commerceJson,
  requireCommerceActor,
  readCommerceJson,
  checkRpcError,
} from "@/lib/commerce/http";

const sectionSchema = z.enum(commerceSections);
const commandSchema = z
  .object({ action: z.string(), payload: z.unknown() })
  .strict();

function sqlPayload(action: CommerceAction, value: unknown) {
  const payload = value as Record<string, unknown>;
  if (action === "document_draft") {
    const { type, ...rest } = payload;
    return { ...rest, document_type: type };
  }
  if (action === "expense_approve")
    return {
      ...payload,
      decision: payload.decision === "approve" ? "approved" : "rejected",
    };
  if (action === "recurring_save") {
    const { name, interval_months, ...rest } = payload;
    return {
      ...rest,
      customer_snapshot: { name },
      interval_unit: "month",
      interval_count: interval_months,
      consented_at: new Date().toISOString(),
    };
  }
  return payload;
}
const capabilities: Partial<Record<CommerceAction, Capability>> = {
  settings_save: "manageSettings",
  expense_approve: "approveExpenses",
  document_reserve: "manageSettings",
  document_correct: "refundPayments",
};

function capabilityFor(action: CommerceAction): Capability {
  if (capabilities[action]) return capabilities[action];
  if (action.startsWith("expense_")) return "manageExpenses";
  if (action.startsWith("cash_")) return "manageCash";
  if (action.startsWith("recurring_")) return "manageRecurring";
  if (action.startsWith("document_")) return "issueDocuments";
  return "recordSale";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ section: string }> },
) {
  try {
    const section = sectionSchema.safeParse((await context.params).section);
    if (!section.success) throw new CommerceError("not_found", 404);
    const { client } = await requireCommerceActor(request, "viewCommerce");
    const url = new URL(request.url);
    const filters = z
      .object({
        page: z.coerce.number().int().min(1).max(10_000).default(1),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        search: z.string().max(200).optional(),
        status: z.string().max(50).optional(),
        from: z
          .string()
          .date()
          .or(z.string().datetime({ offset: true }))
          .optional(),
        to: z
          .string()
          .date()
          .or(z.string().datetime({ offset: true }))
          .optional(),
        supplier: z.string().max(200).optional(),
        category: z.string().max(100).optional(),
        id: z.string().uuid().optional(),
      })
      .safeParse(Object.fromEntries(url.searchParams));
    if (!filters.success) throw new CommerceError("invalid_input");
    const { data, error } = await client.rpc("commerce_read", {
      p_section: section.data,
      p_filters: {
        ...filters.data,
        offset: (filters.data.page - 1) * filters.data.limit,
        state: filters.data.status,
      },
    });
    checkRpcError(error);
    if (section.data === "integrations") {
      const identity = await client.rpc("commerce_read", {
        p_section: "settings",
        p_filters: {},
      });
      checkRpcError(identity.error);
      return commerceJson({
        ...data,
        rows: [...(identity.data?.rows ?? []), ...(data?.rows ?? [])],
        revision: identity.data?.revision ?? 0,
        readiness: identity.data?.readiness,
        runtime: commerceReadiness(),
      });
    }
    return commerceJson(data);
  } catch (error) {
    return commerceFailure(error, "read");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ section: string }> },
) {
  try {
    const section = sectionSchema.safeParse((await context.params).section);
    if (!section.success) throw new CommerceError("not_found", 404);
    const command = commandSchema.safeParse(await readCommerceJson(request));
    if (
      !command.success ||
      !Object.hasOwn(commerceActionSchemas, command.data.action)
    )
      throw new CommerceError("invalid_input");
    const action = command.data.action as CommerceAction;
    if (
      actionSections[action] !== section.data &&
      !(action === "settings_save" && section.data === "integrations")
    )
      throw new CommerceError("invalid_input");
    const { client } = await requireCommerceActor(
      request,
      capabilityFor(action),
    );
    const payload = commerceActionSchemas[action].safeParse(
      command.data.payload,
    );
    if (!payload.success) throw new CommerceError("invalid_input");
    const { data, error } = await client.rpc("commerce_write", {
      p_action: action,
      p_payload: sqlPayload(action, payload.data),
    });
    checkRpcError(error);
    return commerceJson(data);
  } catch (error) {
    return commerceFailure(error, "write");
  }
}
