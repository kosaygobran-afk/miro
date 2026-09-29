import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSameOrigin } from "@/lib/request-origin";

const SOURCE_VALUES = ["contact_page", "product_page", "store_page"] as const;

const enquirySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  message: z.string().trim().min(1).max(2000),
  locale: z.enum(["he", "en"]),
  source: z.enum(SOURCE_VALUES),
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  // Honeypot: legitimate users never fill this hidden field.
  company: z.string().max(200).optional(),
  // Time-trap: ms epoch set when the form was rendered.
  startedAt: z.number().int().positive().optional(),
});

const MIN_SUBMIT_MS = 2000;

const failureCopy = {
  he: {
    invalid_input: "חלק מהפרטים חסרים או שגויים. נסו שוב.",
    rate_limited: "נשלחו יותר מדי פניות. נסו שוב בעוד דקה.",
    unavailable: "השליחה אינה זמינה כרגע. נסו שוב מאוחר יותר.",
  },
  en: {
    invalid_input: "Some details are missing or invalid. Please try again.",
    rate_limited: "Too many enquiries were sent. Please try again in a minute.",
    unavailable: "Submission is unavailable right now. Please try again later.",
  },
} as const;

type FailureCode = keyof (typeof failureCopy)["en"];

function failureResponse(
  code: FailureCode,
  status: number,
  locale: "he" | "en",
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    { ok: false, code, message: failureCopy[locale][code], ...extra },
    { status },
  );
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function localeFromBody(body: unknown): "he" | "en" {
  if (body && typeof body === "object") {
    const value = (body as { locale?: unknown }).locale;
    if (value === "en") return "en";
  }
  return "he";
}

// Build rate limit key for the RPC (IP-based, matches RPC's fallback)
function buildRateLimitKey(ip: string): string {
  return `enquiry:ip:${ip}`;
}

// Check rate limits at API level (before validation) to match original behavior
// and ensure invalid requests still count towards the limit.
async function checkRateLimits(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  ip: string,
): Promise<"ok" | "limited" | "error"> {
  const buckets = [
    { key: `enquiry:ip:1m:${ip}`, limit: 5, window: "1 minute" },
    { key: `enquiry:ip:1h:${ip}`, limit: 30, window: "1 hour" },
  ] as const;
  for (const bucket of buckets) {
    const { data: allowed, error } = await supabase.rpc("check_rate_limit", {
      p_key: bucket.key,
      p_limit: bucket.limit,
      p_window: bucket.window,
    });
    if (error) {
      console.error("check_rate_limit failed:", error.code, error.message);
      return "error";
    }
    if (allowed !== true) return "limited";
  }
  return "ok";
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { ok: false, code: "unavailable" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failureResponse("invalid_input", 400, "he");
  }
  const locale = localeFromBody(body);

  // Rate limit check BEFORE validation (matches original behavior)
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimits(await createServerSupabaseClient(), ip);
  if (rateLimit === "error") {
    // Never silently allow unlimited submissions when the limiter is down.
    return failureResponse("unavailable", 503, locale);
  }
  if (rateLimit === "limited") {
    return failureResponse("rate_limited", 429, locale);
  }

  const parsed = enquirySchema.safeParse(body);
  if (!parsed.success) {
    const issues = Array.from(
      new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? ""))),
    ).filter(Boolean);
    return failureResponse("invalid_input", 400, locale, { issues });
  }

  const data = parsed.data;

  // Honeypot filled by bots: pretend success without storing anything.
  if (data.company && data.company.trim()) {
    return NextResponse.json({ ok: true });
  }

  // Time-trap: submissions faster than a human can type are dropped silently.
  if (data.startedAt && Date.now() - data.startedAt < MIN_SUBMIT_MS) {
    return NextResponse.json({ ok: true });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const rateLimitKey = buildRateLimitKey(ip);
    const phone = data.phone?.trim() || null;

    // Call the RPC for service request creation (enforces validation, audit)
    // Rate limiting already checked at API level; RPC provides defense in depth.
    const { data: requestId, error } = await supabase.rpc("create_service_request", {
      p_name: data.name,
      p_email: data.email,
      p_phone: phone,
      p_message: data.message,
      p_locale: data.locale,
      p_source: data.source,
      p_product_id: data.productId ?? null,
      p_variant_id: data.variantId ?? null,
      p_metadata: {},
      p_rate_limit_key: rateLimitKey,
    });

    if (error) {
      // Map RPC errors to user-facing codes
      if (error.code === "42001" || error.message?.includes("Rate limited")) {
        return failureResponse("rate_limited", 429, locale);
      }
      if (error.code === "22023") {
        return failureResponse("invalid_input", 400, locale);
      }
      console.error("create_service_request failed:", error.code, error.message);
      return failureResponse("unavailable", 503, locale);
    }

    return NextResponse.json({ ok: true, requestId });
  } catch (error) {
    console.error("Enquiry submission failed", error);
    return failureResponse("unavailable", 503, locale);
  }
}
