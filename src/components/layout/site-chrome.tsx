"use client";
import { usePathname } from "next/navigation";

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return /^\/(he|en)\/(ceo|admin|worker)(\/|$)/.test(pathname)
    ? null
    : children;
}
