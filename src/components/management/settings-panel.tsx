"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  AlertCircle,
  RotateCcw,
  ShieldCheck,
  Eye,
  Save,
  DollarSign,
  Package,
  Settings,
  Loader2,
  X,
  CheckCircle,
  Plus,
} from "lucide-react";

type TaxRate = {
  id: string;
  name: string;
  rate: number;
  valid_from: string;
  is_current: boolean;
};

type TaxFormData = {
  name: string;
  rate: number;
  valid_from: string;
};

type InventoryDefaults = {
  low_stock_threshold: number;
  out_of_stock_policy: "allow_backorder" | "deny" | "notify_only";
};

type FinanceSettings = {
  currency: string;
  prices_include_vat: boolean;
};

export function SettingsPanel({
  locale,
  isCeo,
}: {
  locale: "he" | "en";
  isCeo: boolean;
}) {
  const he = locale === "en" ? false : true;

  // State
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success",
  );

  // Tax state
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [taxLoading, setTaxLoading] = useState(true);
  const [taxError, setTaxError] = useState("");
  const [showTaxForm, setShowTaxForm] = useState(false);
  const [taxForm, setTaxForm] = useState<TaxFormData>({
    name: "",
    rate: 0,
    valid_from: new Date().toISOString().split("T")[0],
  });
  const [taxSubmitting, setTaxSubmitting] = useState(false);
  const taxTriggerRef = useRef<HTMLButtonElement>(null);
  const closeTaxModal = useCallback(() => {
    setShowTaxForm(false);
    taxTriggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!showTaxForm) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTaxModal();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showTaxForm, closeTaxModal]);

  // Business settings state
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");
  const [inventoryDefaults, setInventoryDefaults] = useState<InventoryDefaults>(
    {
      low_stock_threshold: 10,
      out_of_stock_policy: "deny",
    },
  );
  const [financeSettings, setFinanceSettings] = useState<FinanceSettings>({
    currency: "ILS",
    prices_include_vat: true,
  });
  const [settingsSubmitting, setSettingsSubmitting] = useState(false);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(""), 5000);
  };

  // Fetch tax rates
  const fetchTaxRates = useCallback(async () => {
    setTaxLoading(true);
    setTaxError("");
    try {
      const response = await fetch("/api/management/tax", {
        cache: "no-store",
      });
      const data = await response.json();
      if (response.ok) {
        setTaxRates(data.taxRates ?? []);
      } else {
        setTaxError(
          data.error ||
            (he ? "לא ניתן לטעון שיעורי מס" : "Unable to load tax rates"),
        );
      }
    } catch {
      setTaxError(he ? "שגיאת חיבור" : "Connection error");
    } finally {
      setTaxLoading(false);
    }
  }, [he]);

  // Fetch business settings
  const fetchBusinessSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError("");
    try {
      const response = await fetch("/api/management/settings", {
        cache: "no-store",
      });
      const data = await response.json();
      if (response.ok) {
        // Parse known settings
        for (const s of data.settings ?? []) {
          if (s.key === "inventory_defaults" && typeof s.value === "object") {
            setInventoryDefaults((prev) => ({
              ...prev,
              ...(s.value as Partial<InventoryDefaults>),
            }));
          }
          if (s.key === "finance" && typeof s.value === "object") {
            setFinanceSettings((prev) => ({
              ...prev,
              ...(s.value as Partial<FinanceSettings>),
            }));
          }
        }
      } else {
        setSettingsError(
          data.error ||
            (he ? "לא ניתן לטעון הגדרות" : "Unable to load settings"),
        );
      }
    } catch {
      setSettingsError(he ? "שגיאת חיבור" : "Connection error");
    } finally {
      setSettingsLoading(false);
    }
  }, [he]);

  useEffect(() => {
    // Initial load - use AbortController to avoid setState-in-effect lint issue
    const controller = new AbortController();

    // Fetch tax rates
    fetch("/api/management/tax", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data) => {
        if (!controller.signal.aborted) {
          if (data.taxRates) {
            setTaxRates(data.taxRates);
          }
          setTaxLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setTaxError(he ? "שגיאת חיבור" : "Connection error");
          setTaxLoading(false);
        }
      });

    // Fetch business settings
    fetch("/api/management/settings", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data) => {
        if (!controller.signal.aborted) {
          for (const s of data.settings ?? []) {
            if (s.key === "inventory_defaults" && typeof s.value === "object") {
              setInventoryDefaults((prev) => ({
                ...prev,
                ...(s.value as Partial<InventoryDefaults>),
              }));
            }
            if (s.key === "finance" && typeof s.value === "object") {
              setFinanceSettings((prev) => ({
                ...prev,
                ...(s.value as Partial<FinanceSettings>),
              }));
            }
          }
          setSettingsLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSettingsError(he ? "שגיאת חיבור" : "Connection error");
          setSettingsLoading(false);
        }
      });

    Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [he]);

  // Tax form handlers
  const handleTaxFormChange = (
    field: keyof TaxFormData,
    value: string | number,
  ) => {
    setTaxForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleTaxSubmit = async () => {
    if (
      !taxForm.name.trim() ||
      taxForm.rate < 0 ||
      taxForm.rate > 99.99 ||
      !taxForm.valid_from
    ) {
      showToast(
        he ? "מלא את כל השדות הנדרשים" : "Fill all required fields",
        "error",
      );
      return;
    }
    setTaxSubmitting(true);
    try {
      const response = await fetch("/api/management/tax", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taxForm),
      });
      const data = await response.json();
      if (response.ok) {
        showToast(he ? "שיעור מס נוסף" : "Tax rate added");
        closeTaxModal();
        setTaxForm({
          name: "",
          rate: 0,
          valid_from: new Date().toISOString().split("T")[0],
        });
        await fetchTaxRates();
      } else if (response.status === 403) {
        showToast(
          he
            ? "נדרש מנכ״ל כדי לשנות שיעור מס"
            : "CEO required to change tax rate",
          "error",
        );
      } else {
        showToast(data.error || (he ? "הוספה נכשלה" : "Add failed"), "error");
      }
    } catch {
      showToast(he ? "שגיאת חיבור" : "Connection error", "error");
    } finally {
      setTaxSubmitting(false);
    }
  };

  // Business settings submit
  const handleSettingsSubmit = async (
    key: "inventory_defaults" | "finance",
  ) => {
    if (!isCeo) return; // Should not happen as button is hidden for non-CEO
    setSettingsSubmitting(true);
    try {
      const value =
        key === "inventory_defaults" ? inventoryDefaults : financeSettings;
      const response = await fetch("/api/management/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = await response.json();
      if (response.ok) {
        showToast(he ? "הגדרות נשמרו" : "Settings saved");
        await fetchBusinessSettings();
      } else if (response.status === 403) {
        showToast(
          he
            ? "נדרש מנכ״ל כדי לשנות הגדרות עסקיות"
            : "CEO required to change business settings",
          "error",
        );
      } else {
        showToast(data.error || (he ? "שמירה נכשלה" : "Save failed"), "error");
      }
    } catch {
      showToast(he ? "שגיאת חיבור" : "Connection error", "error");
    } finally {
      setSettingsSubmitting(false);
    }
  };

  const getCurrentTaxRate = () => taxRates.find((t) => t.is_current);

  const formatRate = (rate: number) => `${rate.toFixed(2)}%`;
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(he ? "he-IL" : "en-IL");

  if (loading) {
    return (
      <div
        className="miro-card settings-panel__loading"
        role="status"
        aria-live="polite"
      >
        <Loader2
          className="h-8 w-8 animate-spin text-primary mx-auto mb-4"
          aria-hidden="true"
        />
        <p>{he ? "טוען הגדרות…" : "Loading settings…"}</p>
      </div>
    );
  }

  return (
    <div className="settings-panel space-y-6">
      {message && (
        <div
          className={`settings-panel__toast ${messageType === "success" ? "settings-panel__toast--success" : "settings-panel__toast--error"}`}
          role="status"
          aria-live="polite"
        >
          {messageType === "success" ? (
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
          )}
          {message}
        </div>
      )}

      {/* Tax Section */}
      <section className="miro-card">
        <div className="border-b border-border-subtle p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <DollarSign className="h-6 w-6 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-2xl font-black">
                  {he ? "הגדרות מס" : "Tax Settings"}
                </h2>
                <p className="mt-1 text-muted-foreground text-sm">
                  {he ? "ניהול שיעורי מע״מ ומסים" : "Manage VAT and tax rates"}
                </p>
              </div>
            </div>
            {isCeo && (
              <button
                ref={taxTriggerRef}
                className="miro-button miro-button-primary"
                onClick={() => setShowTaxForm(true)}
              >
                <Plus className="me-2 h-4 w-4" />
                {he ? "הוסף שיעור מס" : "Add Tax Rate"}
              </button>
            )}
          </div>
        </div>

        {taxLoading && (
          <div
            className="settings-panel__tax-loading p-6 text-center"
            role="status"
            aria-live="polite"
          >
            <Loader2
              className="h-8 w-8 animate-spin text-primary mx-auto mb-2"
              aria-hidden="true"
            />
            <p>{he ? "טוען שיעורי מס…" : "Loading tax rates…"}</p>
          </div>
        )}

        {taxError && !taxLoading && (
          <div
            className="settings-panel__error p-4 border-destructive/50 bg-destructive/5"
            role="alert"
          >
            <div className="flex items-center gap-3">
              <AlertCircle
                className="h-5 w-5 text-destructive"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">
                  {he ? "שגיאה בטעינת שיעורי מס" : "Failed to load tax rates"}
                </p>
                <p className="text-sm text-muted-foreground">{taxError}</p>
                <button
                  className="miro-button miro-button-secondary text-sm mt-2"
                  onClick={fetchTaxRates}
                >
                  <RotateCcw className="h-4 w-4 me-1" aria-hidden="true" />
                  {he ? "נסה שוב" : "Retry"}
                </button>
              </div>
            </div>
          </div>
        )}

        {!taxLoading && !taxError && (
          <>
            {/* Current Active Rate - Prominent Display */}
            <div className="settings-panel__current-rate p-6 border-b border-border-subtle">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {he ? "שיעור מס נוכחי" : "Current Tax Rate"}
                  </p>
                  <div className="flex items-baseline gap-3 mt-1">
                    <span className="text-4xl font-black text-primary">
                      {formatRate(getCurrentTaxRate()?.rate ?? 0)}
                    </span>
                    {getCurrentTaxRate() && (
                      <span className="text-sm text-muted-foreground">
                        {he ? "החל מ-" : "Effective from"}{" "}
                        {formatDate(getCurrentTaxRate()!.valid_from)}
                      </span>
                    )}
                  </div>
                  {getCurrentTaxRate() && (
                    <p className="mt-1 text-sm font-medium">
                      {getCurrentTaxRate()!.name}
                    </p>
                  )}
                </div>
                {!isCeo && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted-foreground/10 text-muted-foreground">
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    {he ? "מצב צפייה בלבד" : "View only"}
                  </span>
                )}
              </div>
            </div>

            {/* Tax Rates History Table */}
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">
                {he ? "היסטוריית שיעורי מס" : "Tax Rate History"}
              </h3>
              {taxRates.length === 0 ? (
                <div className="settings-panel__empty text-center py-8 text-muted-foreground">
                  {he ? "אין שיעורי מס מוגדרים" : "No tax rates defined"}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table
                    className="settings-panel__tax-table min-w-full text-sm"
                    role="grid"
                  >
                    <thead>
                      <tr className="border-b border-border-subtle bg-surface-muted text-start">
                        <th className="p-4">{he ? "שם" : "Name"}</th>
                        <th className="p-4">{he ? "שיעור" : "Rate"}</th>
                        <th className="p-4">
                          {he ? "תחילה" : "Effective From"}
                        </th>
                        <th className="p-4">{he ? "סטטוס" : "Status"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxRates.map((rate) => (
                        <tr
                          key={rate.id}
                          className="border-b border-border-subtle hover:bg-surface-muted/50"
                        >
                          <td className="p-4 font-medium">{rate.name}</td>
                          <td className="p-4 font-mono tabular-nums text-lg">
                            {formatRate(rate.rate)}
                          </td>
                          <td className="p-4">{formatDate(rate.valid_from)}</td>
                          <td className="p-4">
                            {rate.is_current ? (
                              <span className="status-badge status-badge--active">
                                <ShieldCheck
                                  className="h-3 w-3 me-1"
                                  aria-hidden="true"
                                />
                                {he ? "פעיל" : "Active"}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                {he ? "היסטורי" : "Historical"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Add Tax Rate Modal */}
            {isCeo && showTaxForm && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                onClick={closeTaxModal}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="tax-modal-title"
                  className="bg-background rounded-xl shadow-xl max-w-md w-full"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="border-b border-border-subtle p-4 flex items-center justify-between">
                    <h3 id="tax-modal-title" className="text-lg font-black">
                      {he ? "הוסף שיעור מס חדש" : "Add New Tax Rate"}
                    </h3>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={he ? "סגור" : "Close"}
                      onClick={closeTaxModal}
                    >
                      <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleTaxSubmit();
                    }}
                    className="p-4 space-y-4"
                  >
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "שם השיעור *" : "Rate Name *"}
                      </label>
                      <input
                        type="text"
                        value={taxForm.name}
                        onChange={(e) =>
                          handleTaxFormChange("name", e.target.value)
                        }
                        className="miro-input"
                        required
                        placeholder={he ? "למשל: מע״מ 2024" : "e.g. VAT 2024"}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "שיעור (%) *" : "Rate (%) *"}
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="99.99"
                        step="0.01"
                        value={taxForm.rate}
                        onChange={(e) =>
                          handleTaxFormChange(
                            "rate",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="miro-input"
                        required
                        placeholder="17.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "תאריך תחילה *" : "Effective From *"}
                      </label>
                      <input
                        type="date"
                        value={taxForm.valid_from}
                        onChange={(e) =>
                          handleTaxFormChange("valid_from", e.target.value)
                        }
                        className="miro-input"
                        required
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                      <button
                        type="button"
                        className="miro-button miro-button-secondary"
                        onClick={closeTaxModal}
                      >
                        {he ? "ביטול" : "Cancel"}
                      </button>
                      <button
                        type="submit"
                        className="miro-button miro-button-primary"
                        disabled={taxSubmitting}
                      >
                        {taxSubmitting ? (
                          <>
                            <Loader2 className="me-2 h-4 w-4 animate-spin" />
                            {he ? "שומר..." : "Saving..."}
                          </>
                        ) : (
                          <>
                            <Save className="me-2 h-4 w-4" />
                            {he ? "שמור" : "Save"}
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Business Settings Section */}
      <section className="miro-card">
        <div className="border-b border-border-subtle p-6">
          <div className="flex items-center gap-3">
            <Settings className="h-6 w-6 text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-2xl font-black">
                {he ? "הגדרות עסקיות" : "Business Settings"}
              </h2>
              <p className="mt-1 text-muted-foreground text-sm">
                {he
                  ? "הגדרות מלאי, מטבע ותצוגת מחירים"
                  : "Inventory, currency, and price display settings"}
              </p>
            </div>
          </div>
        </div>

        {settingsLoading && (
          <div className="p-6 text-center" role="status" aria-live="polite">
            <Loader2
              className="h-8 w-8 animate-spin text-primary mx-auto mb-2"
              aria-hidden="true"
            />
            <p>{he ? "טוען הגדרות…" : "Loading settings…"}</p>
          </div>
        )}

        {settingsError && !settingsLoading && (
          <div
            className="p-4 border-destructive/50 bg-destructive/5"
            role="alert"
          >
            <div className="flex items-center gap-3">
              <AlertCircle
                className="h-5 w-5 text-destructive"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">
                  {he ? "שגיאה בטעינת הגדרות" : "Failed to load settings"}
                </p>
                <p className="text-sm text-muted-foreground">{settingsError}</p>
                <button
                  className="miro-button miro-button-secondary text-sm mt-2"
                  onClick={fetchBusinessSettings}
                >
                  <RotateCcw className="h-4 w-4 me-1" aria-hidden="true" />
                  {he ? "נסה שוב" : "Retry"}
                </button>
              </div>
            </div>
          </div>
        )}

        {!settingsLoading && !settingsError && (
          <>
            {/* Inventory Defaults */}
            <div className="p-6 border-b border-border-subtle">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <Package
                    className="h-6 w-6 text-primary"
                    aria-hidden="true"
                  />
                  <h3 className="text-lg font-semibold">
                    {he ? "ברירות מחדל למלאי" : "Inventory Defaults"}
                  </h3>
                </div>
                {!isCeo && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted-foreground/10 text-muted-foreground">
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    {he ? "מצב צפייה בלבד" : "View only"}
                  </span>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "סף מלאי נמוך" : "Low Stock Threshold"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={inventoryDefaults.low_stock_threshold}
                    onChange={(e) =>
                      setInventoryDefaults((prev) => ({
                        ...prev,
                        low_stock_threshold: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    className="miro-input"
                    disabled={!isCeo}
                    aria-disabled={!isCeo}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {he
                      ? "מתחת לערך זה יסומן כמלאי נמוך"
                      : "Below this value will be flagged as low stock"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "מדיניות חוסר במלאי" : "Out of Stock Policy"}
                  </label>
                  <select
                    value={inventoryDefaults.out_of_stock_policy}
                    onChange={(e) =>
                      setInventoryDefaults((prev) => ({
                        ...prev,
                        out_of_stock_policy: e.target
                          .value as InventoryDefaults["out_of_stock_policy"],
                      }))
                    }
                    className="miro-input"
                    disabled={!isCeo}
                    aria-disabled={!isCeo}
                  >
                    <option value="deny">
                      {he ? "מנע מכירה" : "Deny sale"}
                    </option>
                    <option value="allow_backorder">
                      {he ? "אפשר הזמנה מראש" : "Allow backorder"}
                    </option>
                    <option value="notify_only">
                      {he ? "התרעה בלבד" : "Notify only"}
                    </option>
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {he
                      ? "התנהגות כשמלאי אוזל"
                      : "Behavior when stock runs out"}
                  </p>
                </div>
              </div>
              {isCeo && (
                <div className="mt-4 flex justify-end">
                  <button
                    className="miro-button miro-button-primary gap-2"
                    onClick={() => handleSettingsSubmit("inventory_defaults")}
                    disabled={settingsSubmitting}
                  >
                    {settingsSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {he ? "שומר..." : "Saving..."}
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        {he ? "שמור הגדרות מלאי" : "Save Inventory Settings"}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Finance Settings */}
            <div className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <DollarSign
                    className="h-6 w-6 text-primary"
                    aria-hidden="true"
                  />
                  <h3 className="text-lg font-semibold">
                    {he ? "הגדרות פיננסיות" : "Finance Settings"}
                  </h3>
                </div>
                {!isCeo && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted-foreground/10 text-muted-foreground">
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    {he ? "מצב צפייה בלבד" : "View only"}
                  </span>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "מטבע ברירת מחדל" : "Default Currency"}
                  </label>
                  <select
                    value={financeSettings.currency}
                    onChange={(e) =>
                      setFinanceSettings((prev) => ({
                        ...prev,
                        currency: e.target.value,
                      }))
                    }
                    className="miro-input"
                    disabled={!isCeo}
                    aria-disabled={!isCeo}
                  >
                    <option value="ILS">
                      {he ? "שקל חדש (₪)" : "Israeli Shekel (₪)"}
                    </option>
                    <option value="USD">
                      {he ? "דולר אמריקאי ($)" : "US Dollar ($)"}
                    </option>
                    <option value="EUR">{he ? "אירו (€)" : "Euro (€)"}</option>
                    <option value="GBP">
                      {he ? "לירה שטרלינג (£)" : "British Pound (£)"}
                    </option>
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={financeSettings.prices_include_vat}
                      onChange={(e) =>
                        setFinanceSettings((prev) => ({
                          ...prev,
                          prices_include_vat: e.target.checked,
                        }))
                      }
                      className="rounded border-border-subtle"
                      disabled={!isCeo}
                    />
                    <span>
                      {he ? "מחירים כוללים מע״מ" : "Prices include VAT"}
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {he
                      ? "האם מחירי המוצרים כוללים מע״מ"
                      : "Whether product prices include VAT"}
                  </p>
                </div>
              </div>
              {isCeo && (
                <div className="mt-4 flex justify-end">
                  <button
                    className="miro-button miro-button-primary gap-2"
                    onClick={() => handleSettingsSubmit("finance")}
                    disabled={settingsSubmitting}
                  >
                    {settingsSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {he ? "שומר..." : "Saving..."}
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        {he ? "שמור הגדרות פיננסיות" : "Save Finance Settings"}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
