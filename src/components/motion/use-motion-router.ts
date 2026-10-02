"use client";

import { useMemo } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { beginNavigation } from "./navigation-events";

export function useRouter() {
  const router = useNextRouter();
  return useMemo(
    () => ({
      ...router,
      push: (...args: Parameters<typeof router.push>) => {
        beginNavigation(args[0]);
        router.push(...args);
      },
      replace: (...args: Parameters<typeof router.replace>) => {
        beginNavigation(args[0]);
        router.replace(...args);
      },
      back: () => {
        beginNavigation();
        router.back();
      },
      forward: () => {
        beginNavigation();
        router.forward();
      },
    }),
    [router],
  );
}
