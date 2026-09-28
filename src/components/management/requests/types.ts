export type RequestStatus =
  "new" | "in_progress" | "waiting_customer" | "closed" | "spam";

export type ServiceRequestRow = {
  id: string;
  customer: {
    id: string | null;
    name: string;
    email: string;
    phone: string | null;
  };
  source: string;
  locale: string | null;
  created_at: string;
  message: string;
  status: string;
  metadata: unknown;
  product: {
    id: string;
    name_he: string;
    name_en: string;
  } | null;
  variant: {
    id: string;
    sku: string;
    color_he: string | null;
    color_en: string | null;
    color_hex: string | null;
  } | null;
  assignedTo: {
    id: string;
    displayName: string | null;
  } | null;
};

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type ProductFilterOption = {
  id: string;
  name_he: string;
  name_en: string;
};

export const REQUEST_STATUSES: readonly RequestStatus[] = [
  "new",
  "in_progress",
  "waiting_customer",
  "closed",
  "spam",
];
