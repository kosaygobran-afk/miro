import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSameOrigin } from "@/lib/request-origin";
import { getStoreCatalog, getStoreViewer } from "@/lib/store-data";
import { resolvePrice } from "@/lib/catalog/pricing";

const SOURCE_VALUES = [
  "contact_page",
  "product_page",
  "store_page",
  "checkout_page",
] as const;

const checkoutCartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  slug: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
  unitPrice: z.number().finite().nonnegative(),
  quantity: z.number().int().min(1).max(99),
});

const shippingSchema = z.object({
  address: z.string().trim().min(1).max(240),
  city: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().max(20),
});

const enquirySchema = z
  .object({
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
    cart: z.array(checkoutCartItemSchema).min(1).max(50).optional(),
    shipping: shippingSchema.optional(),
  })
  .superRefine((data, context) => {
    if (data.source !== "checkout_page") return;
    if (!data.cart) {
      context.addIssue({
        code: "custom",
        path: ["cart"],
        message: "Cart required",
      });
    }
    if (!data.shipping) {
      context.addIssue({
        code: "custom",
        path: ["shipping"],
        message: "Shipping required",
      });
    }
  });

const MIN_SUBMIT_MS = 2000;

const failureCopy = {
  he: {
    invalid_input: "חלק מהפרטים חסרים או שגויים. נסו שוב.",
    rate_limited: "נשלחו יותר מדי פניות. נסו שוב בעוד דקה.",
    unavailable: "השליחה אינה זמינה כרגע. נסו שוב מאוחר יותר.",
    cart_changed: "המלאי או פרטי המוצר השתנו. עדכנו את הסל ונסו שוב.",
  },
  en: {
    invalid_input: "Some details are missing or invalid. Please try again.",
    rate_limited: "Too many enquiries were sent. Please try again in a minute.",
    unavailable: "Submission is unavailable right now. Please try again later.",
    cart_changed:
      "A product or its stock changed. Refresh your cart and try again.",
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
  const rateLimit = await checkRateLimits(
    await createServerSupabaseClient(),
    ip,
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
    const supabase = await createServerSupabaseClient();
    const rateLimitKey = buildRateLimitKey(ip);
    const phone = data.phone?.trim() || null;
    let verifiedCart: typeof data.cart;
    if (data.source === "checkout_page" && data.cart) {
      const viewer = await getStoreViewer();
      const catalog = await getStoreCatalog(data.locale, viewer.role);
      const requestedByVariant = new Map<string, number>();
      verifiedCart = [];
      for (const item of data.cart) {
        const product = catalog.products.find(
          (entry) => entry.id === item.productId,
        );
        const variant = product?.variants.find(
          (entry) => entry.id === item.variantId,
        );
        const requested =
          (requestedByVariant.get(item.variantId) ?? 0) + item.quantity;
        if (
          !product ||
          !variant ||
          requested > variant.stockQty ||
          product.slug !== item.slug
        ) {
          return failureResponse("cart_changed", 409, locale);
        }
        requestedByVariant.set(item.variantId, requested);
        const price = resolvePrice({
          basePrice: product.basePriceIls ?? product.priceIls,
          variants: product.variants,
          selectedVariantId: variant.id,
          defaultVariantId:
            product.variants.find((entry) => entry.isDefault)?.id ?? null,
          roleOverride: product.rolePrice ?? null,
          variantOverride: null,
          publicPromotion: product.publicPromotion ?? null,
        }).effectivePrice;
        if (price === null) return failureResponse("cart_changed", 409, locale);
        verifiedCart.push({
          productId: product.id,
          variantId: variant.id,
          slug: product.slug,
          name: product.name,
          unitPrice: price,
          quantity: item.quantity,
        });
      }
    }

    // Call the RPC for service request creation (enforces validation, audit)
    // Rate limiting already checked at API level; RPC provides defense in depth.
    const { data: requestId, error } = await supabase.rpc(
      "create_service_request",
      {
        p_name: data.name,
        p_email: data.email,
        p_phone: phone,
        p_message: data.message,
        p_locale: data.locale,
        p_source: data.source,
        p_product_id: data.productId ?? null,
        p_variant_id: data.variantId ?? null,
        p_metadata:
          data.source === "checkout_page"
            ? {
                checkout: {
                  cart: verifiedCart,
                  shipping: data.shipping,
                  estimated_subtotal: verifiedCart?.reduce(
                    (total, item) => total + item.unitPrice * item.quantity,
                    0,
                  ),
                  payment_collected: false,
                },
              }
            : {},
        p_rate_limit_key: rateLimitKey,
      },
    );

    if (error) {
      // Map RPC errors to user-facing codes
      if (error.code === "42001" || error.message?.includes("Rate limited")) {
        return failureResponse("rate_limited", 429, locale);
      }
      if (error.code === "22023") {
        return failureResponse("invalid_input", 400, locale);
      }
      console.error(
        "create_service_request failed:",
        error.code,
        error.message,
      );
      return failureResponse("unavailable", 503, locale);
    }

    return NextResponse.json({ ok: true, requestId });
  } catch (error) {
    console.error("Enquiry submission failed", error);
    return failureResponse("unavailable", 503, locale);
  }
}
