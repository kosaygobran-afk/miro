import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSameOrigin } from "@/lib/request-origin";
import { getAuthContext } from "@/lib/auth";

const trackSchema = z.object({
  type: z.enum([
    "product_view",
    "product_impression",
    "product_search",
    "search_no_result",
    "category_view",
    "product_contact_click",
    "product_phone_click",
    "product_whatsapp_click",
    "product_inquiry",
    // Financial events ("sale", "return") are intentionally not accepted here:
    // browser tracking must never carry financial data; trusted sale data comes
    // from orders.
  ]),
  productId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  searchQuery: z.string().max(200).optional(),
  resultsCount: z.number().int().min(0).optional(),
  locale: z.enum(["he", "en"]).optional(),
});

// Per-session/IP rate limiting for analytics tracking (tiered: 100/min, 500/hour)
async function checkTrackingRateLimit(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  key: string,
): Promise<"ok" | "limited" | "error"> {
  const buckets = [
    { key: `track:${key}:1m`, limit: 100, window: "1 minute" },
    { key: `track:${key}:1h`, limit: 500, window: "1 hour" },
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

function getTrackingKey(
  request: NextRequest,
  sessionId: string | null,
): string {
  // Prefer session ID for tracking rate limits; fall back to IP
  if (sessionId) return `sid:${sessionId}`;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return `ip:${first}`;
  }
  return `ip:${request.headers.get("x-real-ip")?.trim() || "unknown"}`;
}

export async function POST(request: NextRequest) {
  // Same-origin check
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // Silently ignore invalid JSON
    return NextResponse.json({ ok: true });
  }

  const parsed = trackSchema.safeParse(body);
  if (!parsed.success) {
    // Silently ignore invalid payload
    return NextResponse.json({ ok: true });
  }

  const { type, productId, categoryId, searchQuery, resultsCount, locale } =
    parsed.data;

  // Get session ID from header or cookie
  const sessionId =
    request.headers.get("x-miro-sid") ??
    request.cookies.get("miro-sid")?.value ??
    null;

  // Get user context if authenticated
  let userId: string | null = null;
  try {
    const authContext = await getAuthContext();
    if (authContext) userId = authContext.user.id;
  } catch {
    // Ignore auth errors, proceed as anonymous
  }

  // Rate limit tracking events per session/IP
  const supabase = await createServerSupabaseClient();
  const trackingKey = getTrackingKey(request, sessionId);
  const rateLimit = await checkTrackingRateLimit(supabase, trackingKey);
  if (rateLimit === "error" || rateLimit === "limited") {
    // Silently drop rate-limited tracking events - never block UI
    return NextResponse.json({ ok: true });
  }

  try {
    await supabase.from("analytics_events").insert({
      event_type: type,
      product_id: productId ?? null,
      category_id: categoryId ?? null,
      search_query: searchQuery ?? null,
      results_count: resultsCount ?? null,
      locale: locale ?? null,
      session_id: sessionId,
      user_id: userId,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Silently swallow DB errors - never block UI
    return NextResponse.json({ ok: true });
  }
}
