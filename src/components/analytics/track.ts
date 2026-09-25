"use client";

type TrackEventType =
  | "product_view"
  | "product_impression"
  | "product_search"
  | "search_no_result"
  | "category_view"
  | "product_contact_click"
  | "product_phone_click"
  | "product_whatsapp_click"
  | "product_inquiry"
  | "sale"
  | "return";

interface TrackEventParams {
  type: TrackEventType;
  productId?: string;
  categoryId?: string;
  searchQuery?: string;
  resultsCount?: number;
  locale?: "he" | "en";
}

const SESSION_ID_KEY = "miro_sid";
const TRACK_ENDPOINT = "/api/track";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let sid = localStorage.getItem(SESSION_ID_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem(SESSION_ID_KEY, sid);
    }
    return sid;
  } catch {
    // Fallback for environments without localStorage
    return crypto.randomUUID();
  }
}

function sendEvent(params: TrackEventParams): void {
  const sessionId = getSessionId();
  const payload = {
    ...params,
    locale:
      params.locale ?? (document.documentElement.lang === "he" ? "he" : "en"),
    session_id: sessionId,
  };

  const body = JSON.stringify(payload);

  // Prefer sendBeacon for reliability (works on page unload)
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    const sent = navigator.sendBeacon(TRACK_ENDPOINT, blob);
    if (sent) return;
  }

  // Fallback to fetch with keepalive
  if (typeof fetch !== "undefined") {
    fetch(TRACK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-miro-sid": sessionId,
      },
      body,
      keepalive: true,
    }).catch(() => {
      // Silently swallow failures
    });
  }
}

/**
 * Track a product view (product detail page load)
 */
export function trackProductView(
  productId: string,
  locale?: "he" | "en",
): void {
  sendEvent({ type: "product_view", productId, locale });
}

/**
 * Track a product impression (product card dialog opened)
 */
export function trackProductImpression(
  productId: string,
  locale?: "he" | "en",
): void {
  sendEvent({ type: "product_impression", productId, locale });
}

/**
 * Track a product search
 */
export function trackProductSearch(
  searchQuery: string,
  resultsCount: number,
  locale?: "he" | "en",
): void {
  sendEvent({ type: "product_search", searchQuery, resultsCount, locale });
  if (resultsCount === 0) {
    sendEvent({ type: "search_no_result", searchQuery, locale });
  }
}

/**
 * Track a category view
 */
export function trackCategoryView(
  categoryId: string,
  locale?: "he" | "en",
): void {
  sendEvent({ type: "category_view", categoryId, locale });
}

/**
 * Track a product contact click (contact form CTA)
 */
export function trackProductContactClick(
  productId: string,
  locale?: "he" | "en",
): void {
  sendEvent({ type: "product_contact_click", productId, locale });
}

/**
 * Track a product phone click
 */
export function trackProductPhoneClick(
  productId: string,
  locale?: "he" | "en",
): void {
  sendEvent({ type: "product_phone_click", productId, locale });
}

/**
 * Track a product WhatsApp click
 */
export function trackProductWhatsAppClick(
  productId: string,
  locale?: "he" | "en",
): void {
  sendEvent({ type: "product_whatsapp_click", productId, locale });
}

/**
 * Generic event tracker for custom events
 */
export function trackEvent(params: TrackEventParams): void {
  sendEvent(params);
}

/**
 * Get the current session ID (for debugging or passing to server components)
 */
export function getClientSessionId(): string {
  return getSessionId();
}

/**
 * Reset the session ID (e.g., on logout)
 */
export function resetSessionId(): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(SESSION_ID_KEY);
    } catch {
      // Ignore
    }
  }
}
