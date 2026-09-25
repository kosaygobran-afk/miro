"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const navItems = [
  { href: "/admin", key: "overview" },
  { href: "/admin/products", key: "products" },
  { href: "/admin/inventory", key: "inventory" },
  { href: "/admin/suppliers", key: "suppliers" },
  { href: "/admin/sales", key: "sales" },
  { href: "/admin/customers", key: "customers" },
  { href: "/admin/analytics", key: "analytics" },
  { href: "/admin/finance", key: "finance" },
  { href: "/admin/users", key: "users" },
  { href: "/admin/requests", key: "requests" },
  { href: "/admin/audit", key: "audit" },
  { href: "/admin/settings", key: "settings" },
] as const;

type NavKey = (typeof navItems)[number]["key"];

const labels: Record<NavKey, { he: string; en: string }> = {
  overview: { he: "סקירה", en: "Overview" },
  products: { he: "מוצרים", en: "Products" },
  inventory: { he: "מלאי", en: "Inventory" },
  suppliers: { he: "ספקים", en: "Suppliers" },
  sales: { he: "מכירות", en: "Sales" },
  customers: { he: "לקוחות", en: "Customers" },
  analytics: { he: "אנליטיקה", en: "Analytics" },
  finance: { he: "כספים", en: "Finance" },
  users: { he: "משתמשים", en: "Users" },
  requests: { he: "פניות", en: "Requests" },
  audit: { he: "יומן פעולות", en: "Audit" },
  settings: { he: "הגדרות", en: "Settings" },
};

export function AdminNav({ locale }: { locale: "he" | "en" }) {
  const pathname = usePathname();

  const currentKey = navItems.find((item) => {
    const fullPath = `/${locale}${item.href}`;
    return pathname === fullPath || pathname.startsWith(fullPath + "/");
  })?.key;

  return (
    <nav
      className="admin-shell__nav"
      aria-label={locale === "he" ? "ניווט ניהול" : "Admin navigation"}
    >
      <div className="admin-shell__nav-scroller">
        <ul className="admin-shell__nav-list" role="tablist">
          {navItems.map((item) => {
            const label = labels[item.key];
            const isActive = currentKey === item.key;
            const href = `/${locale}${item.href}`;
            return (
              <li key={item.key} role="presentation">
                <Link
                  href={href}
                  className={`admin-shell__nav-link ${isActive ? "admin-shell__nav-link--active" : ""}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-current={isActive ? "page" : undefined}
                >
                  {locale === "he" ? label.he : label.en}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
