"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Banknote,
  Boxes,
  CreditCard,
  Package,
  ReceiptText,
  ShoppingCart,
  Users,
} from "lucide-react";
import MotionLink from "@/components/motion/motion-link";
import { usePosViewport } from "@/components/management/tools/pos-viewport-context";
import { useManagementTools } from "../management-tool-provider";
import { computePosTotals, formatPrice } from "./pos-utils";
import type {
  PosCartLine,
  PosPayment,
  PosCustomer,
  PosCatalogItem,
  PosVariant,
  PosGatewayCapabilities,
} from "./pos-types";
import { PosTopbar } from "./pos-topbar";
import { PosCatalog } from "./pos-catalog";
import { PosCart } from "./pos-cart";
import { PosCustomerSheet } from "./pos-customer-sheet";
import { PosSuccessView } from "./pos-success-view";
import type { Locale } from "@/lib/i18n";
import styles from "./pos-workspace.module.css";

interface PosShellProps {
  locale: Locale;
  cartLines: PosCartLine[];
  onCartLineChange: (key: string, patch: Partial<PosCartLine>) => void;
  onCartLineRemove: (key: string) => void;
  onVariantPick: (product: PosCatalogItem, variant: PosVariant) => void;
  customer: PosCustomer | null;
  onCustomerChange: (customer: PosCustomer | null) => void;
  payments: PosPayment[];
  onPaymentChange: (payments: PosPayment[]) => void;
  onRecordSale: () => Promise<void>;
  onClearCart: () => void;
  onCancelPending: () => Promise<void>;
  saving: boolean;
  locked: boolean;
  formErrors: Record<string, string>;
  saveError: string;
  pendingIntentId: string | null;
  vatRate: number | null;
  gatewayCapabilities: PosGatewayCapabilities;
  refreshToken: number;
  successMessage: string | null;
  onDismissSuccess: () => void;
}

export function PosShell(props: PosShellProps) {
  const {
    locale,
    cartLines,
    payments,
    saving,
    locked,
    successMessage,
    onDismissSuccess,
  } = props;
  const he = locale === "he";
  const {
    isActive: isFullscreen,
    enterFullscreen,
    exitFullscreen,
  } = usePosViewport();
  const { closeTool } = useManagementTools();
  const [homeActive, setHomeActive] = useState(false);
  const [mobileView, setMobileView] = useState<"catalog" | "cart">("catalog");
  const [customerOpen, setCustomerOpen] = useState(false);
  const totals = computePosTotals(cartLines, payments, props.vatRate);
  const errors = [
    ...new Set(
      [...Object.values(props.formErrors), props.saveError].filter(Boolean),
    ),
  ];
  const tiles = [
    {
      icon: ShoppingCart,
      label: he ? "מכירה" : "Sale",
      detail: he ? "מוצרים, עגלה ותשלום" : "Products, cart & payment",
      action: () => {
        setHomeActive(false);
        setMobileView("catalog");
      },
    },
    {
      icon: Users,
      label: he ? "לקוח למכירה" : "Sale customer",
      detail: he ? "לקוח קיים או מזדמן" : "Existing or walk-in customer",
      action: () => setCustomerOpen(true),
      disabled: saving || locked,
    },
    {
      icon: Package,
      label: he ? "מוצרים" : "Products",
      detail: he ? "מחירים וקטלוג" : "Prices & catalog",
      href: "products",
    },
    {
      icon: Boxes,
      label: he ? "מלאי" : "Inventory",
      detail: he ? "כמויות וגרסאות" : "Stock & variants",
      href: "inventory",
    },
    {
      icon: CreditCard,
      label: he ? "מכירות" : "Sales",
      detail: he ? "היסטוריה ומצב הזמנות" : "History & order status",
      href: "sales",
    },
    {
      icon: Banknote,
      label: he ? "ניהול קופה" : "Cash management",
      detail: he ? "משמרות ותנועות מזומן" : "Shifts & cash movements",
      href: "cash",
    },
    {
      icon: ReceiptText,
      label: he ? "מסמכים" : "Documents",
      detail: he ? "מסמכים וחריגות הנפקה" : "Documents & issuance status",
      href: "documents",
    },
    {
      icon: BarChart3,
      label: he ? "דוחות" : "Reports",
      detail: he ? "מכירות, תשלומים והוצאות" : "Sales, payments & expenses",
      href: "commerce-reports",
    },
  ];
  return (
    <div
      className={styles.shell}
      dir={he ? "rtl" : "ltr"}
      data-pos-shell="true"
    >
      <PosTopbar
        locale={locale}
        isFullscreen={isFullscreen}
        onEnterFullscreen={enterFullscreen}
        onExitFullscreen={exitFullscreen}
        onHome={() => setHomeActive((value) => !value)}
        homeActive={homeActive}
      />
      {errors.length > 0 && (
        <div className={styles.alerts} role="alert">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
      {props.pendingIntentId && (
        <div className={styles.alerts} role="status">
          {he
            ? "מכירה ממתינה: העגלה מוגנת משינויים עד לבדיקת תוצאת התשלום. אין לקבל את הכסף שוב."
            : "Pending sale: the cart is protected until the payment result is checked. Do not collect the money again."}
        </div>
      )}
      {homeActive ? (
        <section
          className={styles.hub}
          aria-label={he ? "תפריט הקופה" : "POS menu"}
        >
          <div className={styles.hubHeading}>
            <div>
              <h3>{he ? "הכל מתחיל כאן" : "Ready for your next sale"}</h3>
              <p>
                {he
                  ? "כל כלי המכירה במקום אחד. הטיוטה שלך נשמרת."
                  : "Your sales tools in one place. Your draft stays with you."}
              </p>
            </div>
          </div>
          <div className={styles.hubStats}>
            <div className={styles.hubStat}>
              <small>{he ? "פריטים בטיוטה" : "Draft items"}</small>
              <strong>{totals.itemCount}</strong>
            </div>
            <div className={styles.hubStat}>
              <small>{he ? "סכום הטיוטה" : "Draft total"}</small>
              <strong dir="ltr">{formatPrice(totals.total, locale)}</strong>
            </div>
          </div>
          <nav
            className={styles.hubGrid}
            aria-label={he ? "כלי מכירה" : "Sales tools"}
          >
            {tiles.map(
              ({ icon: Icon, label, detail, href, action, disabled }) => {
                const content = (
                  <>
                    <span className={styles.tileIcon}>
                      <Icon size={30} strokeWidth={1.7} aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{label}</strong>
                      <small>{detail}</small>
                    </span>
                  </>
                );
                return href ? (
                  <MotionLink
                    key={href}
                    href={`/${locale}/admin/${href}`}
                    className={styles.hubTile}
                    onNavigate={() => closeTool("pos")}
                  >
                    {content}
                  </MotionLink>
                ) : (
                  <button
                    key={label}
                    type="button"
                    className={styles.hubTile}
                    onClick={action}
                    disabled={disabled}
                  >
                    {content}
                  </button>
                );
              },
            )}
          </nav>
        </section>
      ) : (
        <>
          <div className={styles.workspace} data-mobile-view={mobileView}>
            <section
              className={styles.cartPane}
              aria-label={he ? "העגלה והתשלום" : "Cart and payment"}
            >
              <PosCart
                locale={locale}
                lines={cartLines}
                onLineChange={props.onCartLineChange}
                onLineRemove={props.onCartLineRemove}
                onClearCart={props.onClearCart}
                customer={props.customer}
                onCustomerChange={props.onCustomerChange}
                onOpenCustomer={() => setCustomerOpen(true)}
                payments={payments}
                onPaymentChange={props.onPaymentChange}
                onRecordSale={props.onRecordSale}
                onCancelPending={props.onCancelPending}
                saving={saving}
                locked={locked}
                pendingIntentId={props.pendingIntentId}
                vatRate={props.vatRate}
                gatewayCapabilities={props.gatewayCapabilities}
              />
            </section>
            <section
              className={styles.catalogPane}
              aria-label={he ? "קטלוג מוצרים" : "Product catalog"}
            >
              <PosCatalog
                locale={locale}
                onVariantPick={props.onVariantPick}
                saving={saving || locked}
                refreshToken={props.refreshToken}
              />
            </section>
          </div>
          <div className={styles.mobileBar}>
            <div className={styles.mobileTotal}>
              <small>{he ? "סה״כ לטיוטה" : "Draft total"}</small>
              <span dir="ltr">{formatPrice(totals.total, locale)}</span>
            </div>
            <button
              type="button"
              onClick={() =>
                setMobileView((value) =>
                  value === "catalog" ? "cart" : "catalog",
                )
              }
              aria-label={
                mobileView === "catalog"
                  ? he
                    ? "פתיחת עגלה ותשלום"
                    : "Open cart and payment"
                  : he
                    ? "חזרה למוצרים"
                    : "Back to products"
              }
            >
              {mobileView === "catalog" ? (
                <ShoppingCart size={19} aria-hidden="true" />
              ) : he ? (
                <ArrowRight size={19} aria-hidden="true" />
              ) : (
                <ArrowLeft size={19} aria-hidden="true" />
              )}
              {mobileView === "catalog"
                ? `${he ? "עגלה" : "Cart"} (${totals.itemCount})`
                : he
                  ? "מוצרים"
                  : "Products"}
            </button>
          </div>
        </>
      )}
      <PosCustomerSheet
        locale={locale}
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        customer={props.customer}
        onChange={props.onCustomerChange}
      />
      {successMessage && (
        <PosSuccessView
          locale={locale}
          message={successMessage}
          onDismiss={onDismissSuccess}
        />
      )}
    </div>
  );
}
