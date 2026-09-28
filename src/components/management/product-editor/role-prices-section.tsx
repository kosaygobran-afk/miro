"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { FormField } from "../ui";
import { editorCopy, priceCopy, roleLabels } from "./copy";
import {
  PRICE_ROLES,
  type Locale,
  type PriceRole,
  type RolePrice,
} from "./types";
import styles from "./product-editor.module.css";

export function RolePricesSection({
  locale,
  productId,
  initialPrices,
}: {
  locale: Locale;
  productId: string;
  initialPrices: RolePrice[];
}) {
  const [prices, setPrices] = useState<Partial<Record<PriceRole, number>>>(
    () => {
      const map: Partial<Record<PriceRole, number>> = {};
      for (const entry of initialPrices) {
        if ((PRICE_ROLES as readonly string[]).includes(entry.role)) {
          map[entry.role as PriceRole] = entry.price;
        }
      }
      return map;
    },
  );
  const [inputs, setInputs] = useState<Record<PriceRole, string>>(() => {
    const map = {} as Record<PriceRole, string>;
    for (const role of PRICE_ROLES) {
      const price = initialPrices.find((p) => p.role === role);
      map[role] = price ? String(price.price) : "";
    }
    return map;
  });
  const [savingRole, setSavingRole] = useState<PriceRole | null>(null);
  const [errors, setErrors] = useState<Partial<Record<PriceRole, string>>>({});

  async function saveRolePrice(role: PriceRole) {
    if (savingRole) return;
    const raw = inputs[role].trim();
    const parsed = Number(raw);
    if (raw === "" || !Number.isFinite(parsed) || parsed <= 0) {
      setErrors((prev) => ({
        ...prev,
        [role]: priceCopy.priceMustBePositive[locale],
      }));
      return;
    }
    setSavingRole(role);
    try {
      const response = await fetch("/api/management/product-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, role, price: parsed }),
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setErrors((prev) => ({
          ...prev,
          [role]: err.error || priceCopy.saveFailed[locale],
        }));
        return;
      }
      setPrices((prev) => ({ ...prev, [role]: parsed }));
      setErrors((prev) => ({ ...prev, [role]: undefined }));
    } catch {
      setErrors((prev) => ({ ...prev, [role]: priceCopy.saveFailed[locale] }));
    } finally {
      setSavingRole(null);
    }
  }

  async function removeRolePrice(role: PriceRole) {
    if (savingRole) return;
    setSavingRole(role);
    try {
      const response = await fetch(
        `/api/management/product-prices?productId=${productId}&role=${role}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        setErrors((prev) => ({
          ...prev,
          [role]: priceCopy.removeFailed[locale],
        }));
        return;
      }
      setPrices((prev) => ({ ...prev, [role]: undefined }));
      setInputs((prev) => ({ ...prev, [role]: "" }));
      setErrors((prev) => ({ ...prev, [role]: undefined }));
    } catch {
      setErrors((prev) => ({
        ...prev,
        [role]: priceCopy.removeFailed[locale],
      }));
    } finally {
      setSavingRole(null);
    }
  }

  return (
    <div className={styles.sectionStack}>
      <p className="text-sm text-muted-foreground">
        {priceCopy.rolePricesDescription[locale]}
      </p>
      <div className={styles.fieldGrid}>
        {PRICE_ROLES.map((role) => (
          <div key={role}>
            <FormField
              id={`role-price-${role}`}
              label={roleLabels[role][locale]}
              description={
                prices[role] !== undefined
                  ? new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
                      style: "currency",
                      currency: "ILS",
                      maximumFractionDigits: 2,
                    }).format(prices[role] as number)
                  : priceCopy.noPriceSet[locale]
              }
              error={errors[role]}
            >
              {(control) => (
                <input
                  {...control}
                  type="number"
                  className={`miro-input ${styles.numberInput}`}
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={inputs[role]}
                  onChange={(e) =>
                    setInputs((prev) => ({ ...prev, [role]: e.target.value }))
                  }
                  disabled={savingRole !== null}
                />
              )}
            </FormField>
            <div className={`${styles.tileActions} mt-2`}>
              <button
                type="button"
                className="miro-button miro-button-secondary text-sm"
                onClick={() => void saveRolePrice(role)}
                disabled={savingRole !== null}
              >
                {savingRole === role ? (
                  <>
                    <Loader2
                      className="me-1 h-3 w-3 animate-spin"
                      aria-hidden="true"
                    />
                    {editorCopy.saving[locale]}
                  </>
                ) : (
                  priceCopy.setPrice[locale]
                )}
              </button>
              {prices[role] !== undefined ? (
                <button
                  type="button"
                  className="miro-button miro-button-secondary text-sm text-destructive hover:bg-destructive/10"
                  onClick={() => void removeRolePrice(role)}
                  disabled={savingRole !== null}
                >
                  <Trash2 className="me-1 h-3 w-3" aria-hidden="true" />
                  {priceCopy.removePrice[locale]}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
