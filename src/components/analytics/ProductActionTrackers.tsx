"use client";

import React from "react";
import {
  trackProductContactClick,
  trackProductPhoneClick,
  trackProductWhatsAppClick,
} from "@/components/analytics/track";

interface ProductContactTrackerProps {
  productId: string;
  locale?: "he" | "en";
  children: React.ReactElement<Record<string, unknown>>;
}

function withTracking(
  child: React.ReactElement<Record<string, unknown>>,
  tracker: () => void,
): React.ReactElement<Record<string, unknown>> {
  return React.cloneElement(child, {
    onClick: (event: React.MouseEvent) => {
      tracker();
      (
        child.props.onClick as ((event: React.MouseEvent) => void) | undefined
      )?.(event);
    },
  } as Record<string, unknown>);
}

export function ProductContactTracker({
  productId,
  locale,
  children,
}: ProductContactTrackerProps) {
  return withTracking(children, () =>
    trackProductContactClick(productId, locale),
  );
}

export function ProductPhoneTracker({
  productId,
  locale,
  children,
}: ProductContactTrackerProps) {
  return withTracking(children, () =>
    trackProductPhoneClick(productId, locale),
  );
}

export function ProductWhatsAppTracker({
  productId,
  locale,
  children,
}: ProductContactTrackerProps) {
  return withTracking(children, () =>
    trackProductWhatsAppClick(productId, locale),
  );
}
