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

// Per-IP rate limiting is enforced by the shared check_rate_limit RPC
// (rate_limit_events table in Postgres), so limits hold across server
// instances: tier 1 = 5/min, tier 2 = 30/hour.
type RateLimitOutcome = "ok" | "limited" | "error";

async function checkRateLimits(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  ip: string,
): Promise<RateLimitOutcome> {
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

  const rateLimit = await checkRateLimits(
    await createServerSupabaseClient(),
    getClientIp(request),
  );
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
    // Anon server client: insertion relies on the service_requests RLS
    // anonymous-insert policy with its database-side length caps.
    const supabase = await createServerSupabaseClient();
    const phone = data.phone?.trim();
    const { error } = await supabase.from("service_requests").insert({
      name: data.name,
      email: data.email,
      phone: phone || null,
      message: data.message,
      locale: data.locale,
      source: data.source,
      product_id: data.productId ?? null,
      variant_id: data.variantId ?? null,
      status: "new",
    });

    if (error) {
      console.error("Enquiry insert failed", error.message);
      return failureResponse("unavailable", 503, locale);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Enquiry submission failed", error);
    return failureResponse("unavailable", 503, locale);
  }
}
