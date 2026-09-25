import type { AppRole } from "@/lib/roles";

export type Capability =
  | "manageUsers"
  | "manageCatalog"
  | "manageInventory"
  | "recordSale"
  | "viewAnalytics"
  | "viewFinance"
  | "manageTax"
  | "manageSettings"
  | "viewUsers";

const capabilityMap: Record<AppRole, Capability[]> = {
  ceo: [
    "manageUsers",
    "manageCatalog",
    "manageInventory",
    "recordSale",
    "viewAnalytics",
    "viewFinance",
    "manageTax",
    "manageSettings",
    "viewUsers",
  ],
  admin: [
    "manageCatalog",
    "manageInventory",
    "recordSale",
    "viewAnalytics",
    "viewFinance",
    "viewUsers",
  ],
  worker: [],
  customer: [],
};

export function can(role: AppRole, cap: Capability): boolean {
  return capabilityMap[role]?.includes(cap) ?? false;
}

export function canAny(role: AppRole, caps: Capability[]): boolean {
  return caps.some((cap) => can(role, cap));
}

export function requireCapability(
  context: { role: AppRole } | null,
  cap: Capability,
): { allowed: true } | { allowed: false; error: string } {
  if (!context) {
    return { allowed: false, error: "Unauthorized" };
  }
  if (context.role === "ceo") return { allowed: true };
  if (can(context.role, cap)) return { allowed: true };
  return { allowed: false, error: "Forbidden" };
}
