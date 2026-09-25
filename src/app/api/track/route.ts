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
    "sale",
    "return",
  ]),
  productId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  searchQuery: z.string().max(200).optional(),
  resultsCount: z.number().int().min(0).optional(),
  locale: z.enum(["he", "en"]).optional(),
});

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

  try {
    const supabase = await createServerSupabaseClient();

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
