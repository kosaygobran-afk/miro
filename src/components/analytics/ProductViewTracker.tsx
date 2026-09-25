"use client";

import { useEffect } from "react";
import { trackProductView } from "@/components/analytics/track";

interface ProductViewTrackerProps {
  productId: string;
  locale?: "he" | "en";
}

export function ProductViewTracker({
  productId,
  locale,
}: ProductViewTrackerProps) {
  useEffect(() => {
    trackProductView(productId, locale);
  }, [productId, locale]);

  return null;
}
