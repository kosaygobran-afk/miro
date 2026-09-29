"use client";

import { Loader2, Trash2 } from "lucide-react";
import { FormField } from "../ui";
import { editorCopy, priceCopy, roleLabels } from "./copy";
import {
  PRICE_ROLES,
  type Locale,
  type PriceRole,
} from "./types";
import styles from "./product-editor.module.css";

export type RolePricesState = Partial<Record<PriceRole, number>>;
export type RolePricesInputs = Record<PriceRole, string>;
export type RolePricesInputsUpdater = (prev: RolePricesInputs) => RolePricesInputs;

export function RolePricesSection({
  locale,
  productId,
  prices,
  inputs,
  onPricesChange,
  onInputsChange,
  savingRole,
  setSavingRole,
  errors,
  setErrors,
}: {
  locale: Locale;
  productId: string;
  prices: RolePricesState;
  inputs: RolePricesInputs;
  onPricesChange: (prices: RolePricesState | ((prev: RolePricesState) => RolePricesState)) => void;
  onInputsChange: (inputs: RolePricesInputs | RolePricesInputsUpdater) => void;
  savingRole: PriceRole | null;
  setSavingRole: (role: PriceRole | null) => void;
  errors: Partial<Record<PriceRole, string>>;
  setErrors: (errors: Partial<Record<PriceRole, string>> | ((prev: Partial<Record<PriceRole, string>>) => Partial<Record<PriceRole, string>>)) => void;
}) {
  async function saveRolePrice(role: PriceRole) {
    if (savingRole) return;
    const raw = inputs[role].trim();
    const parsed = Number(raw);
    if (raw === "" || !Number.isFinite(parsed) || parsed <= 0) {
      setErrors((prev: Partial<Record<PriceRole, string>>) => ({
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
        setErrors((prev: Partial<Record<PriceRole, string>>) => ({
          ...prev,
          [role]: err.error || priceCopy.saveFailed[locale],
        }));
        return;
      }
      onPricesChange((prev: Partial<Record<PriceRole, number>>) => ({ ...prev, [role]: parsed }));
      setErrors((prev: Partial<Record<PriceRole, string>>) => ({ ...prev, [role]: undefined }));
    } catch {
      setErrors((prev: Partial<Record<PriceRole, string>>) => ({ ...prev, [role]: priceCopy.saveFailed[locale] }));
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
        setErrors((prev: Partial<Record<PriceRole, string>>) => ({
          ...prev,
          [role]: priceCopy.removeFailed[locale],
        }));
        return;
      }
      const nextPrices = { ...prices };
      delete nextPrices[role];
      onPricesChange(nextPrices);
      onInputsChange((prev: Record<PriceRole, string>) => ({ ...prev, [role]: "" }));
      setErrors((prev: Partial<Record<PriceRole, string>>) => ({ ...prev, [role]: undefined }));
    } catch {
      setErrors((prev: Partial<Record<PriceRole, string>>) => ({
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
                  ? new Intl.NumberFormat(
                      locale === "he" ? "he-IL" : "en-IL",
                      {
                        style: "currency",
                        currency: "ILS",
                        maximumFractionDigits: 2,
                      },
                    ).format(prices[role] as number)
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
                    onInputsChange((prev) => ({ ...prev, [role]: e.target.value }))
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
