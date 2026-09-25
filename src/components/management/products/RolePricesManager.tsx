"use client";

import { useState } from "react";
import { DollarSign, Trash2, Plus } from "lucide-react";

const ROLES = ["customer", "worker", "admin", "ceo"] as const;

type RolePrice = {
  product_id: string;
  role: string;
  price: number;
};

export function RolePricesManager({
  locale,
  productId,
  basePrice,
  initialPrices,
  onPricesChange,
  disabled,
}: {
  locale: "he" | "en";
  productId: string;
  basePrice: number | null;
  initialPrices: RolePrice[];
  onPricesChange: (prices: RolePrice[]) => void;
  disabled?: boolean;
}) {
  const he = locale === "en" ? false : true;
  const [prices, setPrices] = useState<Record<string, number>>(() => {
    const priceMap: Record<string, number> = {};
    initialPrices.forEach((p) => {
      if (p.product_id === productId) priceMap[p.role] = p.price;
    });
    return priceMap;
  });
  const [loading, setLoading] = useState(false);

  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined) return he ? "—" : "—";
    return new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 2,
    }).format(price);
  };

  const roleLabel = (role: string) => {
    const labels: Record<string, string> = he
      ? { customer: "לקוח", worker: "עובד", admin: "מנהל", ceo: "מנכ״ל" }
      : { customer: "Customer", worker: "Worker", admin: "Admin", ceo: "CEO" };
    return labels[role] ?? role;
  };

  const savePrice = async (role: string, price: number) => {
    if (disabled) return;
    setLoading(true);
    try {
      const response = await fetch("/api/management/product-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, role, price }),
      });
      if (!response.ok) throw new Error("Failed to save price");
      setPrices((prev) => ({ ...prev, [role]: price }));
      onPricesChange([
        ...initialPrices.filter(
          (p) => !(p.product_id === productId && p.role === role),
        ),
        { product_id: productId, role, price },
      ]);
    } catch (err) {
      console.error("Failed to save price", err);
    } finally {
      setLoading(false);
    }
  };

  const deletePrice = async (role: string) => {
    if (disabled) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/management/product-prices?productId=${productId}&role=${role}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) throw new Error("Failed to delete price");
      setPrices((prev) => {
        const next = { ...prev };
        delete next[role];
        return next;
      });
      onPricesChange(
        initialPrices.filter(
          (p) => !(p.product_id === productId && p.role === role),
        ),
      );
    } catch (err) {
      console.error("Failed to delete price", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium">
          {he ? "מחירים לפי תפקיד" : "Role-Based Prices"}
        </label>
        <p className="text-xs text-muted-foreground">
          {he
            ? `מחיר בסיס: ${formatPrice(basePrice)}`
            : `Base price: ${formatPrice(basePrice)}`}
        </p>
      </div>

      <div
        className="space-y-2"
        role="list"
        aria-label={he ? "מחירים לפי תפקיד" : "Role-based prices"}
      >
        {ROLES.map((role) => {
          const customPrice = prices[role];
          const hasCustomPrice = customPrice !== undefined;
          const effectivePrice = hasCustomPrice ? customPrice : basePrice;
          return (
            <div
              key={role}
              className="miro-card flex flex-wrap items-center justify-between gap-4 p-4"
              role="listitem"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <DollarSign
                  className="h-5 w-5 text-muted-foreground flex-shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium capitalize">{roleLabel(role)}</p>
                  <p className="text-sm text-muted-foreground">
                    {hasCustomPrice
                      ? he
                        ? "מחיר מותאם אישית"
                        : "Custom price"
                      : he
                        ? "משתמש במחיר הבסיס"
                        : "Uses base price"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium tabular-nums whitespace-nowrap">
                    {formatPrice(effectivePrice)}
                  </span>
                  {!hasCustomPrice && basePrice !== null && (
                    <span className="text-xs text-muted-foreground">
                      {he ? "(בסיס)" : "(base)"}
                    </span>
                  )}
                </div>
                {!disabled && (
                  <>
                    <input
                      type="number"
                      value={hasCustomPrice ? customPrice : ""}
                      onChange={(e) => {
                        const val = e.target.value
                          ? Number(e.target.value)
                          : null;
                        if (val !== null) savePrice(role, val);
                      }}
                      onBlur={(e) => {
                        const val = e.target.value
                          ? Number(e.target.value)
                          : null;
                        if (val !== null && hasCustomPrice)
                          savePrice(role, val);
                      }}
                      className="miro-input w-28 text-sm"
                      min="0"
                      step="0.01"
                      placeholder={he ? "מותאם" : "Custom"}
                      disabled={loading}
                      aria-label={
                        he
                          ? `מחיר מותאם ל${roleLabel(role)}`
                          : `Custom price for ${roleLabel(role)}`
                      }
                    />
                    {hasCustomPrice ? (
                      <button
                        type="button"
                        className="miro-button miro-button-secondary text-sm text-destructive p-2"
                        onClick={() => deletePrice(role)}
                        disabled={loading}
                        aria-label={
                          he
                            ? `הסר מחיר מותאם ל${roleLabel(role)}`
                            : `Remove custom price for ${roleLabel(role)}`
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="miro-button miro-button-secondary text-sm p-2"
                        onClick={() => {
                          const defaultPrice = basePrice ?? 0;
                          savePrice(role, defaultPrice);
                        }}
                        disabled={loading || basePrice === null}
                        aria-label={
                          he
                            ? `הגדר מחיר מותאם ל${roleLabel(role)}`
                            : `Set custom price for ${roleLabel(role)}`
                        }
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {ROLES.every((r) => prices[r] === undefined) && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {he
            ? "אין מחירים מותאמים. כל התפקידים משתמשים במחיר הבסיס."
            : "No custom prices. All roles use the base price."}
        </p>
      )}
    </div>
  );
}
