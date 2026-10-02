"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import type { AppRole } from "@/lib/roles";

const WorkspaceContext = createContext<{
  locale: Locale;
  role: AppRole;
} | null>(null);
export function WorkspaceProvider({
  locale,
  role,
  children,
}: {
  locale: Locale;
  role: AppRole;
  children: ReactNode;
}) {
  return (
    <WorkspaceContext.Provider value={{ locale, role }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  return useContext(WorkspaceContext);
}
