"use client";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";
/** Payment/customer/console URLs stay out of third-party performance collection. */
export function SiteTelemetry() {
  const pathname = usePathname();
  if (
    /^\/(he|en)\/(pay|account|admin|ceo|worker|checkout)(\/|$)/.test(pathname)
  )
    return null;
  return <SpeedInsights />;
}
