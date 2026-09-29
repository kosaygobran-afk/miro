"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RotateCcw,
  ShieldCheck,
  Save,
  DollarSign,
  Package,
  Loader2,
  Plus,
  Building2,
} from "lucide-react";
import {
  PageHeader,
  Dialog,
  FormSection,
  FormField,
  Notice,
  MetricCard,
  DataTable,
  ErrorState,
  EmptyState,
  StatusBadge,
  Skeleton,
} from "./ui";

type TaxRateStatus = "current" | "scheduled" | "historical";

type TaxRate = {
  id: string;
  name: string;
  rate: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  status: TaxRateStatus;
  created_by: string | null;
  created_at: string;
};

type TaxFormData = {
  name: string;
  rate: number;
  valid_from: string;
  valid_until: string | null;
};

type InventoryDefaults = {
  low_stock_threshold: number;
  out_of_stock_policy:
    "keep_visible_contact" | "keep_visible_restock" | "hide_from_public";
};

type FinanceSettings = {
  currency: string;
  prices_include_vat: boolean;
};

type PublicContactForm = {
  phone: string;
  whatsapp: string;
  email: string;
  address_he: string;
  address_en: string;
  hours_he: string;
  hours_en: string;
};

export function SettingsPanel({
  locale,
  isCeo,
}: {
  locale: "he" | "en";
  isCeo: boolean;
}) {
  const he = locale === "he";

  // State
  const [loading, setLoading] = useState(true);
  const [globalNotice, setGlobalNotice] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Tax state
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [taxLoading, setTaxLoading] = useState(true);
  const [taxError, setTaxError] = useState("");
  const [showTaxForm, setShowTaxForm] = useState(false);
  const [taxForm, setTaxForm] = useState<TaxFormData>({
    name: "",
    rate: 0,
    valid_from: new Date().toISOString().split("T")[0],
    valid_until: null,
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

  // Business settings state - split into saved and draft for each section
  type SettingsSection = "inventory_defaults" | "finance" | "public_contact";
  type SettingsSectionState<T> = {
    saved: T;
    draft: T;
    loading: boolean;
    error: string;
    submitting: boolean;
    dirty: boolean;
    loaded: boolean;
  };

  const initialInventoryDefaults: InventoryDefaults = {
    low_stock_threshold: 3,
    out_of_stock_policy: "keep_visible_contact",
  };
  const initialFinanceSettings: FinanceSettings = {
    currency: "ILS",
    prices_include_vat: true,
  };
  const initialPublicContactForm: PublicContactForm = {
    phone: "",
    whatsapp: "",
    email: "",
    address_he: "",
    address_en: "",
    hours_he: "",
    hours_en: "",
  };

  const [inventoryState, setInventoryState] = useState<
    SettingsSectionState<InventoryDefaults>
  >({
    saved: initialInventoryDefaults,
    draft: initialInventoryDefaults,
    loading: true,
    error: "",
    submitting: false,
    dirty: false,
    loaded: false,
  });
  const [financeState, setFinanceState] = useState<
    SettingsSectionState<FinanceSettings>
  >({
    saved: initialFinanceSettings,
    draft: initialFinanceSettings,
    loading: true,
    error: "",
    submitting: false,
    dirty: false,
    loaded: false,
  });
  const [publicContactState, setPublicContactState] = useState<
    SettingsSectionState<PublicContactForm>
  >({
    saved: initialPublicContactForm,
    draft: initialPublicContactForm,
    loading: true,
    error: "",
    submitting: false,
    dirty: false,
    loaded: false,
  });

  // Helper to update draft state
  const updateDraft = useCallback(
    (
      section: SettingsSection,
      updater: (
        prev: InventoryDefaults | FinanceSettings | PublicContactForm,
      ) => InventoryDefaults | FinanceSettings | PublicContactForm,
    ) => {
      if (section === "inventory_defaults") {
        setInventoryState((prev) => ({
          ...prev,
          draft: updater(prev.draft) as InventoryDefaults,
          dirty: true,
        }));
      } else if (section === "finance") {
        setFinanceState((prev) => ({
          ...prev,
          draft: updater(prev.draft) as FinanceSettings,
          dirty: true,
        }));
      } else if (section === "public_contact") {
        setPublicContactState((prev) => ({
          ...prev,
          draft: updater(prev.draft) as PublicContactForm,
          dirty: true,
        }));
      }
    },
    [],
  );

  // Helper to set submitting for a section
  const setSectionSubmitting = useCallback(
    (section: SettingsSection, submitting: boolean) => {
      if (section === "inventory_defaults") {
        setInventoryState((prev) => ({ ...prev, submitting }));
      } else if (section === "finance") {
        setFinanceState((prev) => ({ ...prev, submitting }));
      } else if (section === "public_contact") {
        setPublicContactState((prev) => ({ ...prev, submitting }));
      }
    },
    [],
  );

  const showNotice = useCallback(
    (text: string, type: "success" | "error" = "success") => {
      setGlobalNotice({ text, type });
      setTimeout(() => setGlobalNotice(null), 5000);
    },
    [],
  );

  // Shared loader utility
  const loadResource = useCallback(
    async <T,>(
      url: string,
      onSuccess: (data: T) => void,
      onError: (error: string) => void,
      setLoadingState: (loading: boolean) => void,
    ) => {
      setLoadingState(true);
      try {
        const response = await fetch(url, { cache: "no-store" });
        const data = await response.json();
        if (response.ok) {
          onSuccess(data);
        } else {
          onError(data.error || (he ? "טעינה נכשלה" : "Failed to load"));
        }
      } catch {
        onError(he ? "שגיאת חיבור" : "Connection error");
      } finally {
        setLoadingState(false);
      }
    },
    [he],
  );

  // Fetch tax rates
  const fetchTaxRates = useCallback(async () => {
    await loadResource(
      "/api/management/tax",
      (data: { taxRates?: TaxRate[] }) => setTaxRates(data.taxRates ?? []),
      (error) => setTaxError(error),
      setTaxLoading,
    );
  }, [loadResource]);

  // Fetch business settings - load each section independently
  const fetchBusinessSettings = useCallback(async () => {
    await loadResource(
      "/api/management/settings",
      (data: { settings?: Array<{ key: string; value: unknown }> }) => {
        setInventoryState((prev) => ({
          ...prev,
          loading: false,
          loaded: true,
          error: "",
        }));
        setFinanceState((prev) => ({
          ...prev,
          loading: false,
          loaded: true,
          error: "",
        }));
        setPublicContactState((prev) => ({
          ...prev,
          loading: false,
          loaded: true,
          error: "",
        }));
        // Parse known settings - only update saved state, never overwrite dirty drafts
        for (const s of data.settings ?? []) {
          if (s.key === "inventory_defaults" && typeof s.value === "object") {
            const saved = s.value as Partial<InventoryDefaults>;
            setInventoryState((prev) => ({
              ...prev,
              saved: { ...prev.saved, ...saved },
              // Only update draft if not dirty (user hasn't made changes)
              draft: prev.dirty ? prev.draft : { ...prev.draft, ...saved },
              loading: false,
              loaded: true,
            }));
          }
          if (s.key === "finance" && typeof s.value === "object") {
            const saved = s.value as Partial<FinanceSettings>;
            setFinanceState((prev) => ({
              ...prev,
              saved: { ...prev.saved, ...saved },
              draft: prev.dirty ? prev.draft : { ...prev.draft, ...saved },
              loading: false,
              loaded: true,
            }));
          }
          if (s.key === "public_contact" && typeof s.value === "object") {
            const value = s.value as Record<string, unknown>;
            const saved: PublicContactForm = {
              phone: (value.phone as string) ?? "",
              whatsapp: (value.whatsapp as string) ?? "",
              email: (value.email as string) ?? "",
              address_he: (value.address_he as string) ?? "",
              address_en: (value.address_en as string) ?? "",
              hours_he: (value.hours_he as string) ?? "",
              hours_en: (value.hours_en as string) ?? "",
            };
            setPublicContactState((prev) => ({
              ...prev,
              saved,
              draft: prev.dirty ? prev.draft : saved,
              loading: false,
              loaded: true,
            }));
          }
        }
      },
      (error) => {
        // Error will be set per-section via the individual loading states
        setInventoryState((prev) => ({
          ...prev,
          error,
          loading: false,
          loaded: true,
        }));
        setFinanceState((prev) => ({
          ...prev,
          error,
          loading: false,
          loaded: true,
        }));
        setPublicContactState((prev) => ({
          ...prev,
          error,
          loading: false,
          loaded: true,
        }));
      },
      () => {}, // We handle loading per-section
    );
  }, [loadResource]);

  useEffect(() => {
    // Initial load - use shared loader to ensure response.ok checks
    const controller = new AbortController();
    let mounted = true;

    const loadInitial = async () => {
      try {
        // Fetch tax rates
        const taxRes = await fetch("/api/management/tax", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (taxRes.ok) {
          const taxData = await taxRes.json();
          if (mounted && taxData.taxRates) setTaxRates(taxData.taxRates);
        } else if (mounted) {
          setTaxError(he ? "טעינה נכשלה" : "Failed to load");
        }
        if (mounted) setTaxLoading(false);

        // Fetch business settings
        const settingsRes = await fetch("/api/management/settings", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          if (mounted) {
            for (const s of settingsData.settings ?? []) {
              if (
                s.key === "inventory_defaults" &&
                typeof s.value === "object"
              ) {
                const saved = s.value as Partial<InventoryDefaults>;
                setInventoryState((prev) => ({
                  ...prev,
                  saved: { ...prev.saved, ...saved },
                  draft: { ...prev.draft, ...saved },
                  loading: false,
                  loaded: true,
                }));
              }
              if (s.key === "finance" && typeof s.value === "object") {
                const saved = s.value as Partial<FinanceSettings>;
                setFinanceState((prev) => ({
                  ...prev,
                  saved: { ...prev.saved, ...saved },
                  draft: { ...prev.draft, ...saved },
                  loading: false,
                  loaded: true,
                }));
              }
              if (s.key === "public_contact" && typeof s.value === "object") {
                const value = s.value as Record<string, unknown>;
                const saved: PublicContactForm = {
                  phone: (value.phone as string) ?? "",
                  whatsapp: (value.whatsapp as string) ?? "",
                  email: (value.email as string) ?? "",
                  address_he: (value.address_he as string) ?? "",
                  address_en: (value.address_en as string) ?? "",
                  hours_he: (value.hours_he as string) ?? "",
                  hours_en: (value.hours_en as string) ?? "",
                };
                setPublicContactState((prev) => ({
                  ...prev,
                  saved,
                  draft: saved,
                  loading: false,
                  loaded: true,
                }));
              }
            }
          }
        } else if (mounted) {
          setInventoryState((prev) => ({
            ...prev,
            error: he ? "טעינה נכשלה" : "Failed to load",
            loading: false,
            loaded: true,
          }));
          setFinanceState((prev) => ({
            ...prev,
            error: he ? "טעינה נכשלה" : "Failed to load",
            loading: false,
            loaded: true,
          }));
          setPublicContactState((prev) => ({
            ...prev,
            error: he ? "טעינה נכשלה" : "Failed to load",
            loading: false,
            loaded: true,
          }));
        }
        if (mounted) {
          setInventoryState((prev) => ({
            ...prev,
            loading: false,
            loaded: true,
          }));
          setFinanceState((prev) => ({
            ...prev,
            loading: false,
            loaded: true,
          }));
          setPublicContactState((prev) => ({
            ...prev,
            loading: false,
            loaded: true,
          }));
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setTaxError(he ? "שגיאת חיבור" : "Connection error");
          setInventoryState((prev) => ({
            ...prev,
            error: he ? "שגיאת חיבור" : "Connection error",
            loading: false,
            loaded: true,
          }));
          setFinanceState((prev) => ({
            ...prev,
            error: he ? "שגיאת חיבור" : "Connection error",
            loading: false,
            loaded: true,
          }));
          setPublicContactState((prev) => ({
            ...prev,
            error: he ? "שגיאת חיבור" : "Connection error",
            loading: false,
            loaded: true,
          }));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadInitial();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [he]);

  // Tax form handlers
  const handleTaxFormChange = (
    field: keyof TaxFormData,
    value: string | number | null,
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
      showNotice(
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
        showNotice(he ? "שיעור מס נוסף" : "Tax rate added");
        closeTaxModal();
        setTaxForm({
          name: "",
          rate: 0,
          valid_from: new Date().toISOString().split("T")[0],
          valid_until: null,
        });
        await fetchTaxRates();
      } else if (response.status === 403) {
        showNotice(
          he
            ? "נדרש מנכ״ל כדי לשנות שיעור מס"
            : "CEO required to change tax rate",
          "error",
        );
      } else {
        showNotice(data.error || (he ? "הוספה נכשלה" : "Add failed"), "error");
      }
    } catch {
      showNotice(he ? "שגיאת חיבור" : "Connection error", "error");
    } finally {
      setTaxSubmitting(false);
    }
  };

  // Business settings submit
  const handleSettingsSubmit = async (
    key: "inventory_defaults" | "finance",
  ) => {
    if (!isCeo) return;
    setSectionSubmitting(key, true);
    try {
      const value =
        key === "inventory_defaults"
          ? inventoryState.draft
          : financeState.draft;
      const response = await fetch("/api/management/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = await response.json();
      if (response.ok) {
        showNotice(he ? "הגדרות נשמרו" : "Settings saved");
        // Only update the saved state for this section from server response
        // The fetchBusinessSettings will update saved state
        await fetchBusinessSettings();
      } else if (response.status === 403) {
        showNotice(
          he
            ? "נדרש מנכ״ל כדי לשנות הגדרות עסקיות"
            : "CEO required to change business settings",
          "error",
        );
      } else {
        showNotice(data.error || (he ? "שמירה נכשלה" : "Save failed"), "error");
      }
    } catch {
      showNotice(he ? "שגיאת חיבור" : "Connection error", "error");
    } finally {
      setSectionSubmitting(key, false);
    }
  };

  // Public contact submit
  const handlePublicContactSubmit = async () => {
    if (!isCeo) return;
    setSectionSubmitting("public_contact", true);
    setPublicContactState((prev) => ({ ...prev, error: "" }));
    try {
      // Convert empty strings to null for optional fields
      const value: Record<string, unknown> = {};
      for (const [field, fieldValue] of Object.entries(
        publicContactState.draft,
      )) {
        if (fieldValue !== undefined) {
          value[field] = fieldValue === "" ? null : fieldValue;
        }
      }
      const response = await fetch("/api/management/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "public_contact", value }),
      });
      const data = await response.json();
      if (response.ok) {
        showNotice(he ? "פרטי קשר עודכנו" : "Contact info updated");
        await fetchBusinessSettings();
      } else if (response.status === 403) {
        showNotice(
          he
            ? "נדרש מנכ״ל כדי לשנות פרטי קשר"
            : "CEO required to change contact info",
          "error",
        );
      } else {
        setPublicContactState((prev) => ({
          ...prev,
          error: data.error || (he ? "שמירה נכשלה" : "Save failed"),
        }));
      }
    } catch {
      setPublicContactState((prev) => ({
        ...prev,
        error: he ? "שגיאת חיבור" : "Connection error",
      }));
    } finally {
      setSectionSubmitting("public_contact", false);
    }
  };

  const getCurrentTaxRate = () => taxRates.find((t) => t.status === "current");

  const formatRate = (rate: number) => `${rate.toFixed(2)}%`;
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(he ? "he-IL" : "en-IL");

  const getStatusLabel = (status: TaxRateStatus) => {
    switch (status) {
      case "current":
        return he ? "פעיל" : "Active";
      case "scheduled":
        return he ? "מתוזמן" : "Scheduled";
      case "historical":
        return he ? "היסטורי" : "Historical";
    }
  };

  const getStatusTone = (status: TaxRateStatus) => {
    switch (status) {
      case "current":
        return "success";
      case "scheduled":
        return "info";
      case "historical":
        return "neutral";
    }
  };

  if (loading) {
    return (
      <div className="settings-panel" role="status" aria-live="polite">
        <Skeleton className="mgmt-skeleton--w-lg mgmt-skeleton--text" />
        <Skeleton className="mgmt-skeleton--w-md mgmt-skeleton--text" />
        <Skeleton className="mgmt-skeleton--w-full mgmt-skeleton--text" />
      </div>
    );
  }

  return (
    <div className="settings-panel space-y-6">
      <PageHeader
        title={he ? "הגדרות" : "Settings"}
        subtitle={
          he
            ? "ניהול מס, מלאי, מטבע, תצוגת מחירים ופרטי קשר"
            : "Manage tax, inventory, currency, price display, and contact settings"
        }
      />

      {globalNotice && (
        <Notice
          tone={globalNotice.type === "success" ? "success" : "danger"}
          title={
            globalNotice.type === "success"
              ? he
                ? "הצלחה"
                : "Success"
              : he
                ? "שגיאה"
                : "Error"
          }
          onDismiss={() => setGlobalNotice(null)}
        >
          {globalNotice.text}
        </Notice>
      )}

      {/* Tax Section */}
      <FormSection
        title={
          <>
            <DollarSign
              className="h-5 w-5 text-primary me-2"
              aria-hidden="true"
            />
            {he ? "שיעורי מס" : "Tax Rates"}
          </>
        }
        description={
          he
            ? "ניהול שיעורי מע״מ פעילים, מתוזמנים והיסטוריים"
            : "Manage active, scheduled, and historical VAT rates"
        }
        actions={
          isCeo ? (
            <button
              ref={taxTriggerRef}
              className="mgmt-button mgmt-button--primary"
              onClick={() => setShowTaxForm(true)}
            >
              <Plus className="h-4 w-4 me-1" aria-hidden="true" />
              {he ? "הוסף שיעור מס" : "Add Tax Rate"}
            </button>
          ) : null
        }
      >
        {/* Current Active Rate - Prominent Display */}
        <div className="mgmt-form-section__body">
          {taxLoading && (
            <ErrorState
              title={he ? "טוען שיעורי מס…" : "Loading tax rates…"}
              onRetry={fetchTaxRates}
              retryLabel={he ? "נסה שוב" : "Retry"}
            />
          )}

          {taxError && !taxLoading && (
            <ErrorState
              title={he ? "שגיאה בטעינת שיעורי מס" : "Failed to load tax rates"}
              description={taxError}
              onRetry={fetchTaxRates}
              retryLabel={he ? "נסה שוב" : "Retry"}
            />
          )}

          {!taxLoading && !taxError && (
            <>
              {/* Current Rate Metric Card */}
              <MetricCard
                label={he ? "שיעור מס נוכחי" : "Current Tax Rate"}
                value={
                  <>
                    <span className="font-variant-numeric tabular-nums">
                      {formatRate(getCurrentTaxRate()?.rate ?? 0)}
                    </span>
                  </>
                }
                tone="accent"
                icon={
                  getCurrentTaxRate() && (
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  )
                }
                footer={
                  getCurrentTaxRate() ? (
                    <>
                      {he ? "החל מ-" : "Effective from"}{" "}
                      {formatDate(getCurrentTaxRate()!.valid_from)} —{" "}
                      {getCurrentTaxRate()!.name}
                    </>
                  ) : (
                    <span className="text-error-text">
                      {he ? "אין שיעור מס פעיל" : "No active tax rate"}
                    </span>
                  )
                }
              />

              {/* Tax Rates History Table */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4">
                  {he ? "היסטוריית שיעורי מס" : "Tax Rate History"}
                </h3>
                <DataTable
                  caption={he ? "היסטוריית שיעורי מס" : "Tax rate history"}
                  head={
                    <tr className="border-b border-border-subtle bg-surface-muted text-start">
                      <th className="p-4">{he ? "שם" : "Name"}</th>
                      <th className="p-4">{he ? "שיעור" : "Rate"}</th>
                      <th className="p-4">{he ? "תחילה" : "Effective From"}</th>
                      <th className="p-4">{he ? "תוקף עד" : "Valid Until"}</th>
                      <th className="p-4">{he ? "סטטוס" : "Status"}</th>
                    </tr>
                  }
                  isEmpty={taxRates.length === 0}
                  emptyState={
                    <EmptyState
                      compact
                      icon={
                        <DollarSign className="h-6 w-6" aria-hidden="true" />
                      }
                      title={
                        he ? "אין שיעורי מס מוגדרים" : "No tax rates defined"
                      }
                      description={
                        he
                          ? "הוסף שיעור מס ראשון כדי להתחיל"
                          : "Add your first tax rate to get started"
                      }
                      action={
                        isCeo ? (
                          <button
                            className="mgmt-button mgmt-button--primary"
                            onClick={() => setShowTaxForm(true)}
                          >
                            <Plus className="h-4 w-4 me-1" aria-hidden="true" />
                            {he ? "הוסף שיעור מס" : "Add Tax Rate"}
                          </button>
                        ) : null
                      }
                    />
                  }
                  minWidth="48rem"
                >
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
                        {rate.valid_until
                          ? formatDate(rate.valid_until)
                          : he
                            ? "ללא הגבלה"
                            : "No expiry"}
                      </td>
                      <td className="p-4">
                        <StatusBadge tone={getStatusTone(rate.status)} withDot>
                          {getStatusLabel(rate.status)}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </div>

              {/* Add Tax Rate Modal */}
              {isCeo && (
                <Dialog
                  open={showTaxForm}
                  onClose={closeTaxModal}
                  title={he ? "הוסף שיעור מס חדש" : "Add New Tax Rate"}
                  size="md"
                  closeLabel={he ? "סגור" : "Close"}
                  footer={
                    <div className="mgmt-dialog__actions">
                      <button
                        type="button"
                        className="mgmt-button mgmt-button--ghost"
                        onClick={closeTaxModal}
                        disabled={taxSubmitting}
                      >
                        {he ? "ביטול" : "Cancel"}
                      </button>
                      <button
                        type="button"
                        className="mgmt-button mgmt-button--primary"
                        onClick={() => void handleTaxSubmit()}
                        disabled={taxSubmitting}
                        aria-busy={taxSubmitting || undefined}
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
                  }
                >
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleTaxSubmit();
                    }}
                  >
                    <FormField
                      label={he ? "שם השיעור *" : "Rate Name *"}
                      required
                      error={
                        taxForm.name && !taxForm.name.trim()
                          ? he
                            ? "נדרש שם"
                            : "Name required"
                          : undefined
                      }
                      description={he ? "למשל: מע״מ 2024" : "e.g. VAT 2024"}
                    >
                      {({
                        id,
                        required,
                        "aria-invalid": ariaInvalid,
                        "aria-describedby": ariaDescribedBy,
                      }) => (
                        <input
                          type="text"
                          id={id}
                          required={required}
                          aria-invalid={ariaInvalid}
                          aria-describedby={ariaDescribedBy}
                          value={taxForm.name}
                          onChange={(e) =>
                            handleTaxFormChange("name", e.target.value)
                          }
                          className="miro-input"
                          placeholder={he ? "למשל: מע״מ 2024" : "e.g. VAT 2024"}
                        />
                      )}
                    </FormField>
                    <FormField
                      label={he ? "שיעור (%) *" : "Rate (%) *"}
                      required
                      error={
                        taxForm.rate < 0 || taxForm.rate > 99.99
                          ? he
                            ? "שיעור חייב להיות בין 0 ל-99.99"
                            : "Rate must be between 0 and 99.99"
                          : undefined
                      }
                    >
                      {({
                        id,
                        required,
                        "aria-invalid": ariaInvalid,
                        "aria-describedby": ariaDescribedBy,
                      }) => (
                        <input
                          type="number"
                          min="0"
                          max="99.99"
                          step="0.01"
                          id={id}
                          required={required}
                          aria-invalid={ariaInvalid}
                          aria-describedby={ariaDescribedBy}
                          value={taxForm.rate}
                          onChange={(e) =>
                            handleTaxFormChange(
                              "rate",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="miro-input"
                          placeholder="17.00"
                        />
                      )}
                    </FormField>
                    <FormField
                      label={he ? "תאריך תחילה *" : "Effective From *"}
                      required
                    >
                      {({
                        id,
                        required,
                        "aria-invalid": ariaInvalid,
                        "aria-describedby": ariaDescribedBy,
                      }) => (
                        <input
                          type="date"
                          id={id}
                          required={required}
                          aria-invalid={ariaInvalid}
                          aria-describedby={ariaDescribedBy}
                          value={taxForm.valid_from}
                          onChange={(e) =>
                            handleTaxFormChange("valid_from", e.target.value)
                          }
                          className="miro-input"
                        />
                      )}
                    </FormField>
                    <FormField
                      label={
                        he
                          ? "תאריך תפוגה (אופציונלי)"
                          : "Expiry Date (optional)"
                      }
                      description={
                        he
                          ? "השאר ריק לשיעור ללא תפוגה"
                          : "Leave empty for no expiry"
                      }
                    >
                      {({ id, "aria-describedby": ariaDescribedBy }) => (
                        <input
                          type="date"
                          id={id}
                          aria-describedby={ariaDescribedBy}
                          value={taxForm.valid_until ?? ""}
                          onChange={(e) =>
                            handleTaxFormChange(
                              "valid_until",
                              e.target.value || null,
                            )
                          }
                          className="miro-input"
                        />
                      )}
                    </FormField>
                  </form>
                </Dialog>
              )}
            </>
          )}
        </div>
      </FormSection>

      {/* Business Settings Section - Inventory Defaults */}
      <FormSection
        title={
          <>
            <Package className="h-5 w-5 text-primary me-2" aria-hidden="true" />
            {he ? "ברירות מחדל למלאי" : "Inventory Defaults"}
          </>
        }
        description={
          he
            ? "הגדרות סף מלאי נמוך ומדיניות חוסר במלאי"
            : "Configure low stock threshold and out of stock policy"
        }
      >
        <div className="mgmt-form-section__body">
          {inventoryState.loading && (
            <div className="mgmt-section-loading" role="status">
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              {he ? "טוען הגדרות…" : "Loading settings…"}
            </div>
          )}

          {inventoryState.error && !inventoryState.loading && (
            <ErrorState
              title={he ? "שגיאה בטעינת הגדרות" : "Failed to load settings"}
              description={inventoryState.error}
              onRetry={fetchBusinessSettings}
              retryLabel={he ? "נסה שוב" : "Retry"}
            />
          )}

          {!inventoryState.loading && !inventoryState.error && (
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label={he ? "סף מלאי נמוך" : "Low Stock Threshold"}
                description={
                  he
                    ? "מתחת לערך זה יסומן כמלאי נמוך"
                    : "Below this value will be flagged as low stock"
                }
              >
                {({ id, "aria-describedby": ariaDescribedBy }) => (
                  <input
                    type="number"
                    min="0"
                    id={id}
                    aria-describedby={ariaDescribedBy}
                    value={inventoryState.draft.low_stock_threshold}
                    onChange={(e) =>
                      updateDraft("inventory_defaults", (prev) => ({
                        ...prev,
                        low_stock_threshold: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    className="miro-input"
                    disabled={!isCeo}
                    aria-disabled={!isCeo}
                  />
                )}
              </FormField>
              <FormField
                label={he ? "מדיניות חוסר במלאי" : "Out of Stock Policy"}
                description={
                  he ? "התנהגות כשמלאי אוזל" : "Behavior when stock runs out"
                }
              >
                {({ id, "aria-describedby": ariaDescribedBy }) => (
                  <select
                    id={id}
                    aria-describedby={ariaDescribedBy}
                    value={inventoryState.draft.out_of_stock_policy}
                    onChange={(e) =>
                      updateDraft("inventory_defaults", (prev) => ({
                        ...prev,
                        out_of_stock_policy: e.target
                          .value as InventoryDefaults["out_of_stock_policy"],
                      }))
                    }
                    className="miro-input"
                    disabled={!isCeo}
                    aria-disabled={!isCeo}
                  >
                    <option value="keep_visible_contact">
                      {he
                        ? "הצג עם 'צור קשר לזמינות'"
                        : "Show with 'Contact for availability'"}
                    </option>
                    <option value="keep_visible_restock">
                      {he
                        ? "הצג עם תאריך חידוש מלאי צפוי"
                        : "Show with expected restock date"}
                    </option>
                    <option value="hide_from_public">
                      {he ? "הסתר מהחנות" : "Hide from storefront"}
                    </option>
                  </select>
                )}
              </FormField>
            </div>
          )}
          {isCeo && (
            <div className="mt-4 flex justify-end">
              <button
                className="mgmt-button mgmt-button--primary gap-2"
                onClick={() => handleSettingsSubmit("inventory_defaults")}
                disabled={inventoryState.submitting || !inventoryState.loaded}
              >
                {inventoryState.submitting ? (
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
      </FormSection>

      {/* Business Settings Section - Finance Settings */}
      <FormSection
        title={
          <>
            <DollarSign
              className="h-5 w-5 text-primary me-2"
              aria-hidden="true"
            />
            {he ? "הגדרות פיננסיות" : "Finance Settings"}
          </>
        }
        description={
          he
            ? "מטבע ברירת מחדל ותצוגת מחירים (לצורכי תצוגה בלבד)"
            : "Default currency and price display (display purposes only)"
        }
      >
        <div className="mgmt-form-section__body">
          {financeState.loading && (
            <div className="mgmt-section-loading" role="status">
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              {he ? "טוען הגדרות…" : "Loading settings…"}
            </div>
          )}

          {financeState.error && !financeState.loading && (
            <ErrorState
              title={he ? "שגיאה בטעינת הגדרות" : "Failed to load settings"}
              description={financeState.error}
              onRetry={fetchBusinessSettings}
              retryLabel={he ? "נסה שוב" : "Retry"}
            />
          )}

          {!financeState.loading && !financeState.error && (
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label={he ? "מטבע ברירת מחדל" : "Default Currency"}
                description={
                  he
                    ? "מטבע התצוגה - MIRO מוכר בש״ח בלבד"
                    : "Display currency — MIRO sells in ILS only"
                }
              >
                {({ id, "aria-describedby": ariaDescribedBy }) => (
                  <select
                    id={id}
                    aria-describedby={ariaDescribedBy}
                    value={financeState.draft.currency}
                    onChange={(e) =>
                      updateDraft("finance", (prev) => ({
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
                )}
              </FormField>
              <FormField
                label=""
                description={
                  he
                    ? "האם מחירי המוצרים כוללים מע״מ (לצורכי תצוגה בלבד)"
                    : "Whether product prices include VAT (display only)"
                }
              >
                {({ id, "aria-describedby": ariaDescribedBy }) => (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      id={id}
                      aria-describedby={ariaDescribedBy}
                      checked={financeState.draft.prices_include_vat}
                      onChange={(e) =>
                        updateDraft("finance", (prev) => ({
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
                )}
              </FormField>
            </div>
          )}
          {isCeo && (
            <div className="mt-4 flex justify-end">
              <button
                className="mgmt-button mgmt-button--primary gap-2"
                onClick={() => handleSettingsSubmit("finance")}
                disabled={financeState.submitting || !financeState.loaded}
              >
                {financeState.submitting ? (
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
      </FormSection>

      {/* Public Contact Settings Section */}
      <FormSection
        title={
          <>
            <Building2
              className="h-5 w-5 text-primary me-2"
              aria-hidden="true"
            />
            {he ? "פרטי קשר ציבוריים" : "Public Contact Info"}
          </>
        }
        description={
          he
            ? "פרטים שיוצגו באתר החנות ובחשבוניות"
            : "Details shown on the storefront and invoices"
        }
      >
        <div className="mgmt-form-section__body">
          {publicContactState.loading && (
            <div className="mgmt-section-loading" role="status">
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              {he ? "טוען הגדרות…" : "Loading settings…"}
            </div>
          )}

          {publicContactState.error && !publicContactState.loading && (
            <Notice
              tone="danger"
              title={
                he ? "שגיאה בטעינת פרטי קשר" : "Failed to load contact info"
              }
              onDismiss={() =>
                setPublicContactState((prev) => ({ ...prev, error: "" }))
              }
            >
              {publicContactState.error}
              <button
                className="mgmt-button mgmt-button--ghost text-sm mt-2"
                onClick={fetchBusinessSettings}
              >
                <RotateCcw className="h-4 w-4 me-1" aria-hidden="true" />
                {he ? "נסה שוב" : "Retry"}
              </button>
            </Notice>
          )}

          {!publicContactState.loading && (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <FormField
                  label={he ? "טלפון" : "Phone"}
                  description={he ? "מספר טלפון ראשי" : "Primary phone number"}
                >
                  {({ id, "aria-describedby": ariaDescribedBy }) => (
                    <input
                      type="tel"
                      id={id}
                      aria-describedby={ariaDescribedBy}
                      value={publicContactState.draft.phone}
                      onChange={(e) =>
                        updateDraft("public_contact", (prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                      className="miro-input"
                      disabled={!isCeo}
                      aria-disabled={!isCeo}
                      placeholder={he ? "050-1234567" : "050-1234567"}
                    />
                  )}
                </FormField>
                <FormField
                  label={he ? "וואטסאפ" : "WhatsApp"}
                  description={
                    he
                      ? "מספר וואטסאפ (ללא קידומת +)"
                      : "WhatsApp number (no + prefix)"
                  }
                >
                  {({ id, "aria-describedby": ariaDescribedBy }) => (
                    <input
                      type="tel"
                      id={id}
                      aria-describedby={ariaDescribedBy}
                      value={publicContactState.draft.whatsapp}
                      onChange={(e) =>
                        updateDraft("public_contact", (prev) => ({
                          ...prev,
                          whatsapp: e.target.value,
                        }))
                      }
                      className="miro-input"
                      disabled={!isCeo}
                      aria-disabled={!isCeo}
                      placeholder={he ? "0501234567" : "0501234567"}
                    />
                  )}
                </FormField>
                <FormField
                  label={he ? "אימייל" : "Email"}
                  description={
                    he ? "כתובת אימייל ליצירת קשר" : "Contact email address"
                  }
                >
                  {({ id, "aria-describedby": ariaDescribedBy }) => (
                    <input
                      type="email"
                      id={id}
                      aria-describedby={ariaDescribedBy}
                      value={publicContactState.draft.email}
                      onChange={(e) =>
                        updateDraft("public_contact", (prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                      className="miro-input"
                      disabled={!isCeo}
                      aria-disabled={!isCeo}
                      placeholder="contact@example.com"
                    />
                  )}
                </FormField>
                <FormField
                  label={he ? "כתובת (עברית)" : "Address (Hebrew)"}
                  description={
                    he ? "כתובת מלאה בעברית" : "Full address in Hebrew"
                  }
                  className="lg:col-span-3"
                >
                  {({ id, "aria-describedby": ariaDescribedBy }) => (
                    <input
                      type="text"
                      id={id}
                      aria-describedby={ariaDescribedBy}
                      value={publicContactState.draft.address_he}
                      onChange={(e) =>
                        updateDraft("public_contact", (prev) => ({
                          ...prev,
                          address_he: e.target.value,
                        }))
                      }
                      className="miro-input"
                      disabled={!isCeo}
                      aria-disabled={!isCeo}
                      placeholder={he ? "רחוב 1, עיר" : "Street 1, City"}
                    />
                  )}
                </FormField>
                <FormField
                  label={he ? "כתובת (אנגלית)" : "Address (English)"}
                  description={
                    he ? "כתובת מלאה באנגלית" : "Full address in English"
                  }
                  className="lg:col-span-3"
                >
                  {({ id, "aria-describedby": ariaDescribedBy }) => (
                    <input
                      type="text"
                      id={id}
                      aria-describedby={ariaDescribedBy}
                      value={publicContactState.draft.address_en}
                      onChange={(e) =>
                        updateDraft("public_contact", (prev) => ({
                          ...prev,
                          address_en: e.target.value,
                        }))
                      }
                      className="miro-input"
                      disabled={!isCeo}
                      aria-disabled={!isCeo}
                      placeholder="Street 1, City"
                    />
                  )}
                </FormField>
                <FormField
                  label={he ? "שעות פתיחה (עברית)" : "Hours (Hebrew)"}
                  description={
                    he ? "למשל: א-ה 09:00-18:00" : "e.g. Sun-Thu 09:00-18:00"
                  }
                >
                  {({ id, "aria-describedby": ariaDescribedBy }) => (
                    <input
                      type="text"
                      id={id}
                      aria-describedby={ariaDescribedBy}
                      value={publicContactState.draft.hours_he}
                      onChange={(e) =>
                        updateDraft("public_contact", (prev) => ({
                          ...prev,
                          hours_he: e.target.value,
                        }))
                      }
                      className="miro-input"
                      disabled={!isCeo}
                      aria-disabled={!isCeo}
                      placeholder={
                        he ? "א-ה 09:00-18:00" : "Sun-Thu 09:00-18:00"
                      }
                    />
                  )}
                </FormField>
                <FormField
                  label={he ? "שעות פתיחה (אנגלית)" : "Hours (English)"}
                  description={
                    he
                      ? "למשל: Sun-Thu 09:00-18:00"
                      : "e.g. Mon-Fri 09:00-18:00"
                  }
                >
                  {({ id, "aria-describedby": ariaDescribedBy }) => (
                    <input
                      type="text"
                      id={id}
                      aria-describedby={ariaDescribedBy}
                      value={publicContactState.draft.hours_en}
                      onChange={(e) =>
                        updateDraft("public_contact", (prev) => ({
                          ...prev,
                          hours_en: e.target.value,
                        }))
                      }
                      className="miro-input"
                      disabled={!isCeo}
                      aria-disabled={!isCeo}
                      placeholder="Mon-Fri 09:00-18:00"
                    />
                  )}
                </FormField>
              </div>

              {isCeo && (
                <div className="mt-4 flex justify-end">
                  <button
                    className="mgmt-button mgmt-button--primary gap-2"
                    onClick={handlePublicContactSubmit}
                    disabled={
                      publicContactState.submitting ||
                      !publicContactState.loaded
                    }
                  >
                    {publicContactState.submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {he ? "שומר..." : "Saving..."}
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        {he ? "שמור פרטי קשר" : "Save Contact Info"}
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </FormSection>
    </div>
  );
}
