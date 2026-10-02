"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { beginNavigation } from "./navigation-events";

/** Next's onNavigate distinguishes accepted client navigation from cancelled/modifier clicks. */
export default function MotionLink({
  onNavigate,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      data-motion-link="true"
      onNavigate={(event) => {
        let cancelled = false;
        onNavigate?.({
          preventDefault() {
            cancelled = true;
            event.preventDefault();
          },
        });
        if (!cancelled)
          beginNavigation(
            typeof props.href === "string" ? props.href : undefined,
          );
      }}
    />
  );
}
