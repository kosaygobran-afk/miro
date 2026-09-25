"use client";

import { useEffect } from "react";
import { trackCategoryView } from "@/components/analytics/track";

interface CategoryViewTrackerProps {
  categoryId: string;
  locale?: "he" | "en";
}

export function CategoryViewTracker({
  categoryId,
  locale,
}: CategoryViewTrackerProps) {
  useEffect(() => {
    trackCategoryView(categoryId, locale);
  }, [categoryId, locale]);

  return null;
}
