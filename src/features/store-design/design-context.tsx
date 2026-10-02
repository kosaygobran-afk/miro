"use client";
import { createContext, useContext } from "react";
import {
  defaultStorefrontDesign,
  type StorefrontDesign,
} from "@/lib/storefront-design";
const DesignContext = createContext(defaultStorefrontDesign);
export function StoreDesignProvider({
  design,
  children,
}: {
  design: StorefrontDesign;
  children: React.ReactNode;
}) {
  return (
    <DesignContext.Provider value={design}>{children}</DesignContext.Provider>
  );
}
export const useStoreDesign = () => useContext(DesignContext);
