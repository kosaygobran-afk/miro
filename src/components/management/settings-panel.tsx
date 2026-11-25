"use client";

import Link from "next/link";
import { withLocale, type Locale } from "@/lib/i18n";
import {
  validateInventoryDefaults,
  type InventoryDefaults,
} from "@/features/catalog/inventory-types";
import { useState, useEffect, useCallback, useId, useRef } from "react";
import { AnimationSettings } from "./animation-settings";
import { GlobalGlassSettings } from "@/components/glass-preference";
import {
  ShieldCheck,
  Save,
  DollarSign,
  Package,
  Loader2,
  Plus,
  Building2,
} from "lucide-react";
import {
  Dialog,
  FormSection,
  FormField,
  Notice,
  MetricCard,
  DataTable,
  ErrorState,
  EmptyState,
  StatusBadge,
  FormSkeleton,
  TableSkeleton,
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
  rate: number | null;
  valid_from: string;
  valid_until: string | null;
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
type PublicContactFallbacks = Partial<
  Record<keyof PublicContactForm, string | null>
>;

type SettingsValues = {
  inventory_defaults: InventoryDefaults;
  public_contact: PublicContactForm;
};

type SettingsSection = keyof SettingsValues;
type SectionState<T> = {
  saved: T;
  draft: Partial<T>;
  notice: { text: string; tone: "success" | "danger" } | null;
};
type SettingsState = {
  [Key in SettingsSection]: SectionState<SettingsValues[Key]>;
};
type SettingsRow = { key: string; value: unknown };

function reloadSection<T extends object>(
  section: SectionState<T>,
  saved: T,
): SectionState<T> {
  const draft = { ...section.draft };
  for (const field of Object.keys(draft) as Array<keyof T>) {
    if (draft[field] === saved[field]) delete draft[field];
  }
  return { saved, draft, notice: null };
}

function readContactForm(
  value: unknown,
  fallbacks?: PublicContactFallbacks,
): PublicContactForm {
  const fields =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  function read(key: keyof PublicContactForm) {
    if (!Object.hasOwn(fields, key)) return fallbacks?.[key] ?? "";
    return typeof fields[key] === "string" ? fields[key] : "";
  }
  return {
    phone: read("phone"),
    whatsapp: read("whatsapp"),
    email: read("email"),
    address_he: read("address_he"),
    address_en: read("address_en"),
    hours_he: read("hours_he"),
    hours_en: read("hours_en"),
  };
}

function newTaxForm(): TaxFormData {
  return {
    name: "",
    rate: null,
    valid_from: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
    }).format(new Date()),
    valid_until: null,
  };
}

function SettingsFormActions({
  locale,
  dirty,
  saving,
  saveLabel,
  onDiscard,
}: {
  locale: Locale;
  dirty: boolean;
  saving: boolean;
  saveLabel: string;
  onDiscard: () => void;
}) {
  const he = locale === "he";
  return (
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <button
        type="button"
        className="mgmt-button mgmt-button--ghost"
        onClick={onDiscard}
        disabled={!dirty || saving}
      >
        {he ? "ביטול שינויים" : "Discard changes"}
      </button>
      <button
        type="submit"
        className="mgmt-button mgmt-button--primary gap-2"
        disabled={!dirty || saving}
        aria-busy={saving || undefined}
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {he ? "שומר…" : "Saving…"}
          </>
        ) : (
          <>
            <Save className="h-4 w-4" aria-hidden="true" />
            {saveLabel}
          </>
        )}
      </button>
    </div>
  );
}

export function SettingsPanel({
  locale,
  isCeo,
}: {
  locale: Locale;
  isCeo: boolean;
}) {
  const he = locale === "he";
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [taxLoading, setTaxLoading] = useState(true);
  const [taxError, setTaxError] = useState("");
  const [taxSaved, setTaxSaved] = useState(false);
  const [taxSaveError, setTaxSaveError] = useState("");
  const [showTaxForm, setShowTaxForm] = useState(false);
  const [taxForm, setTaxForm] = useState(newTaxForm);
  const [taxSubmitting, setTaxSubmitting] = useState(false);
  const taxRequest = useRef(false);
  const taxFormId = useId();

  const [settings, setSettings] = useState<SettingsState>({
    inventory_defaults: {
      saved: validateInventoryDefaults({}),
      draft: {},
      notice: null,
    },
    public_contact: { saved: readContactForm(null), draft: {}, notice: null },
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");
  const [saving, setSaving] = useState<
    Partial<Record<SettingsSection, boolean>>
  >({});
  const saveRequests = useRef(new Set<SettingsSection>());
  const settingsRead = useRef<AbortController | null>(null);

  const fetchTaxRates = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch("/api/management/tax", {
          cache: "no-store",
          signal,
        });
        if (!response.ok) throw new Error("load_failed");
        const result: { taxRates: TaxRate[] } = await response.json();
        if (!Array.isArray(result.taxRates))
          throw new Error("invalid_response");
        if (!signal?.aborted) {
          setTaxRates(result.taxRates);
          setTaxError("");
        }
      } catch {
        if (!signal?.aborted) {
          setTaxError(
            he ? "לא ניתן לטעון שיעורי מס" : "Unable to load tax rates",
          );
        }
      } finally {
        if (!signal?.aborted) setTaxLoading(false);
      }
    },
    [he],
  );

  const fetchBusinessSettings = useCallback(async () => {
    if (saveRequests.current.size) return;
    settingsRead.current?.abort();
    const request = new AbortController();
    settingsRead.current = request;
    try {
      const response = await fetch("/api/management/settings", {
        cache: "no-store",
        signal: request.signal,
      });
      if (!response.ok) throw new Error("load_failed");
      const result: {
        settings: SettingsRow[];
        publicContactFallbacks?: PublicContactFallbacks;
      } = await response.json();
      const inventory = result.settings.find(
        ({ key }) => key === "inventory_defaults",
      );
      const contact = result.settings.find(
        ({ key }) => key === "public_contact",
      );
      if (!request.signal.aborted) {
        const inventoryDefaults = validateInventoryDefaults(
          inventory?.value ?? {},
        );
        const contactForm = readContactForm(
          contact?.value,
          result.publicContactFallbacks,
        );
        setSettings((previous) => ({
          inventory_defaults: reloadSection(
            previous.inventory_defaults,
            inventoryDefaults,
          ),
          public_contact: reloadSection(previous.public_contact, contactForm),
        }));
        setSettingsError("");
      }
    } catch {
      if (!request.signal.aborted) {
        setSettingsError(
          he
            ? "לא ניתן לטעון את ההגדרות השמורות"
            : "Unable to load saved settings",
        );
      }
    } finally {
      if (!request.signal.aborted) {
        settingsRead.current = null;
        setSettingsLoading(false);
      }
    }
  }, [he]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void fetchTaxRates(controller.signal);
      void fetchBusinessSettings();
    });
    return () => {
      controller.abort();
      settingsRead.current?.abort();
    };
  }, [fetchBusinessSettings, fetchTaxRates]);

  function updateSection<Key extends SettingsSection>(
    key: Key,
    update: (current: SettingsState[Key]) => SettingsState[Key],
  ) {
    setSettings((previous) => ({ ...previous, [key]: update(previous[key]) }));
  }

  function updateDraft<
    Key extends SettingsSection,
    Field extends keyof SettingsValues[Key],
  >(key: Key, field: Field, value: SettingsValues[Key][Field]) {
    updateSection(key, (section) => {
      const draft = { ...section.draft };
      if (section.saved[field] === value) {
        delete draft[field];
      } else {
        draft[field] = value;
      }
      return { ...section, draft, notice: null };
    });
  }

  function discardDraft(key: SettingsSection) {
    updateSection(key, (section) => ({ ...section, draft: {}, notice: null }));
  }

  function reloadSavedSettings() {
    if (saveRequests.current.size) return;
    setSettingsLoading(true);
    void fetchBusinessSettings();
  }

  function reloadTaxRates() {
    setTaxLoading(true);
    void fetchTaxRates();
  }

  function handleTaxFormChange<Key extends keyof TaxFormData>(
    field: Key,
    value: TaxFormData[Key],
  ) {
    setTaxForm((current) => ({ ...current, [field]: value }));
  }

  function closeTaxModal() {
    if (!taxRequest.current) setShowTaxForm(false);
  }

  function openTaxModal() {
    setTaxSaveError("");
    setShowTaxForm(true);
  }

  async function handleTaxSubmit() {
    if (!isCeo || taxRequest.current) return;
    if (
      !taxForm.name.trim() ||
      taxForm.rate === null ||
      !Number.isFinite(taxForm.rate) ||
      taxForm.rate < 0 ||
      taxForm.rate > 99.99 ||
      !taxForm.valid_from
    ) {
      setTaxSaveError(
        he ? "מלאו את כל השדות הנדרשים" : "Fill all required fields",
      );
      return;
    }
    taxRequest.current = true;
    setTaxSubmitting(true);
    setTaxSaveError("");
    setTaxSaved(false);
    try {
      const response = await fetch("/api/management/tax", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taxForm),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setTaxSaveError(
          data?.error ||
            (he ? "הוספת שיעור המס נכשלה" : "Unable to add the tax rate"),
        );
        return;
      }
      setShowTaxForm(false);
      setTaxForm(newTaxForm());
      setTaxSaved(true);
      reloadTaxRates();
    } catch {
      setTaxSaveError(
        he
          ? "לא ניתן היה לאמת את השמירה. סגרו את הטופס ורעננו את העמוד לפני ניסיון נוסף."
          : "The save could not be confirmed. Close the form and reload this page before trying again.",
      );
    } finally {
      setTaxSubmitting(false);
      taxRequest.current = false;
    }
  }

  async function handleSettingsSubmit(key: SettingsSection) {
    if (
      !isCeo ||
      settingsRead.current ||
      settingsLoading ||
      settingsError ||
      saveRequests.current.has(key)
    )
      return;
    const { draft } = settings[key];
    if (Object.keys(draft).length === 0) return;

    saveRequests.current.add(key);
    setSaving((previous) => ({ ...previous, [key]: true }));
    updateSection(key, (section) => ({ ...section, notice: null }));
    try {
      const value = Object.fromEntries(
        Object.entries(draft).map(([field, input]) => [
          field,
          input === "" ? null : input,
        ]),
      );
      const response = await fetch("/api/management/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = await response.json();
      if (!response.ok) {
        const text =
          response.status === 403
            ? he
              ? "נדרשת הרשאת מנכ״ל לשמירה"
              : "Only the CEO can save these settings."
            : data.error ||
              (he ? "שמירת ההגדרות נכשלה" : "Unable to save these settings.");
        updateSection(key, (section) => ({
          ...section,
          notice: { text, tone: "danger" },
        }));
        return;
      }
      if (!data.ok || !data.value || typeof data.value !== "object") {
        throw new Error("save_unconfirmed");
      }

      const notice = {
        text: he ? "ההגדרות נשמרו" : "Settings saved",
        tone: "success",
      } as const;
      if (key === "inventory_defaults") {
        updateSection(key, () => ({
          saved: validateInventoryDefaults(data.value),
          draft: {},
          notice,
        }));
      } else {
        updateSection(key, () => ({
          saved: readContactForm(data.value, data.publicContactFallbacks),
          draft: {},
          notice,
        }));
      }
    } catch {
      const text = he
        ? "לא ניתן היה לאמת את השמירה. יש לרענן את הערכים השמורים לפני ניסיון נוסף."
        : "The save could not be confirmed. Reload the saved values before trying again.";
      updateSection(key, (section) => ({
        ...section,
        notice: { text, tone: "danger" },
      }));
    } finally {
      saveRequests.current.delete(key);
      setSaving((previous) => ({ ...previous, [key]: false }));
    }
  }

  const inventoryState = settings.inventory_defaults;
  const inventoryDraft = { ...inventoryState.saved, ...inventoryState.draft };
  const publicContactState = settings.public_contact;
  const publicContactDraft = {
    ...publicContactState.saved,
    ...publicContactState.draft,
  };
  const inventoryDirty = Object.keys(inventoryState.draft).length > 0;
  const contactDirty = Object.keys(publicContactState.draft).length > 0;
  const anySaving = saving.inventory_defaults || saving.public_contact;
  const loadError = (
    <ErrorState
      title={he ? "שגיאה בטעינת הגדרות" : "Failed to load settings"}
      description={settingsError}
      onRetry={reloadSavedSettings}
      retryLabel={he ? "נסו שוב" : "Retry"}
    />
  );
  const refreshSaved = (
    <button
      type="button"
      className="mgmt-button mgmt-button--ghost"
      onClick={reloadSavedSettings}
      disabled={settingsLoading || !!settingsError || anySaving}
    >
      {he ? "רענון ערכים שמורים" : "Reload saved values"}
    </button>
  );
  const currentTaxRate = taxRates.find((rate) => rate.status === "current");

  const formatRate = (rate: number) => `${rate.toFixed(2)}%`;
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(he ? "he-IL" : "en-IL", {
      timeZone: "Asia/Jerusalem",
    });

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

  return (
    <div className="settings-panel space-y-6">
      <GlobalGlassSettings locale={locale} />
      <AnimationSettings locale={locale} isCeo={isCeo} />

      {/* Tax Section */}
      <FormSection
        sectionId="settings-tax"
        icon={<DollarSign size={19} aria-hidden="true" />}
        title={he ? "שיעורי מס" : "Tax Rates"}
        description={
          he
            ? "ניהול שיעורי מע״מ פעילים, מתוזמנים והיסטוריים"
            : "Manage active, scheduled, and historical VAT rates"
        }
        actions={
          isCeo ? (
            <button
              type="button"
              disabled={taxLoading || !!taxError}
              className="mgmt-button mgmt-button--primary"
              onClick={openTaxModal}
            >
              <Plus className="h-4 w-4 me-1" aria-hidden="true" />
              {he ? "הוסף שיעור מס" : "Add Tax Rate"}
            </button>
          ) : null
        }
      >
        {/* Current Active Rate - Prominent Display */}
        <div className="settings-section-content">
          {taxSaved && (
            <Notice
              tone="success"
              onDismiss={() => setTaxSaved(false)}
              dismissLabel={he ? "סגור" : "Dismiss"}
            >
              {he ? "שיעור המס נוסף" : "Tax rate added"}
            </Notice>
          )}
          {taxLoading ? (
            <TableSkeleton
              columns={
                he
                  ? ["שם", "שיעור", "תחילה", "תוקף עד", "סטטוס"]
                  : ["Name", "Rate", "Effective from", "Valid until", "Status"]
              }
              label={he ? "טוען שיעורי מס…" : "Loading tax rates…"}
            />
          ) : null}

          {taxError && !taxLoading && (
            <ErrorState
              title={he ? "שגיאה בטעינת שיעורי מס" : "Failed to load tax rates"}
              description={taxError}
              onRetry={reloadTaxRates}
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
                      {currentTaxRate ? formatRate(currentTaxRate.rate) : "—"}
                    </span>
                  </>
                }
                tone="accent"
                icon={
                  currentTaxRate && (
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  )
                }
                footer={
                  currentTaxRate ? (
                    <>
                      {he ? "החל מ-" : "Effective from"}{" "}
                      {formatDate(currentTaxRate.valid_from)} —{" "}
                      {currentTaxRate.name}
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
                            type="button"
                            className="mgmt-button mgmt-button--primary"
                            onClick={openTaxModal}
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
                        type="submit"
                        form={taxFormId}
                        className="mgmt-button mgmt-button--primary"
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
                    id={taxFormId}
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleTaxSubmit();
                    }}
                  >
                    {taxSaveError && (
                      <Notice tone="danger">{taxSaveError}</Notice>
                    )}
                    <fieldset disabled={taxSubmitting} className="space-y-4">
                      <FormField
                        label={he ? "שם השיעור" : "Rate Name"}
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
                            maxLength={100}
                            placeholder={
                              he ? "למשל: מע״מ 2024" : "e.g. VAT 2024"
                            }
                          />
                        )}
                      </FormField>
                      <FormField
                        label={he ? "שיעור (%)" : "Rate (%)"}
                        required
                        error={
                          taxForm.rate !== null &&
                          (taxForm.rate < 0 || taxForm.rate > 99.99)
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
                            value={taxForm.rate ?? ""}
                            onChange={(e) =>
                              handleTaxFormChange(
                                "rate",
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                              )
                            }
                            className="miro-input"
                            placeholder="17.00"
                          />
                        )}
                      </FormField>
                      <FormField
                        label={he ? "תאריך תחילה" : "Effective From"}
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
                    </fieldset>
                  </form>
                </Dialog>
              )}
            </>
          )}
        </div>
      </FormSection>

      {/* Business Settings Section - Inventory Defaults */}
      <FormSection
        sectionId="settings-inventory"
        icon={<Package size={19} aria-hidden="true" />}
        title={he ? "ברירות מחדל למלאי" : "Inventory Defaults"}
        description={
          he
            ? "ברירות מחדל לגרסאות חדשות ולמוצרים שיורשים את מדיניות החנות."
            : "Defaults for new variants and products that inherit the store’s stock policy."
        }
        actions={refreshSaved}
      >
        <div className="settings-section-content">
          {settingsLoading ? (
            <FormSkeleton
              fields={2}
              label={he ? "טוען הגדרות…" : "Loading settings…"}
            />
          ) : settingsError ? (
            loadError
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSettingsSubmit("inventory_defaults");
              }}
            >
              <fieldset
                disabled={!isCeo || saving.inventory_defaults}
                className="grid gap-4 md:grid-cols-2"
              >
                <FormField
                  label={
                    he
                      ? "סף מלאי נמוך לגרסאות חדשות"
                      : "Default low-stock threshold for new variants"
                  }
                  required
                  description={
                    he
                      ? "מלאי חיובי עד לסף יסומן כנמוך. הערך 0 מבטל את הסימון. אפשר לשנות את הסף בכל גרסה. ספים קיימים נשמרים."
                      : "Positive stock at or below the threshold is flagged. Zero turns off the flag. Each variant can override the default, and existing variants keep their thresholds."
                  }
                >
                  {({ id, required, "aria-describedby": ariaDescribedBy }) => (
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      id={id}
                      required={required}
                      aria-describedby={ariaDescribedBy}
                      value={
                        Number.isNaN(inventoryDraft.low_stock_threshold)
                          ? ""
                          : inventoryDraft.low_stock_threshold
                      }
                      onChange={(e) =>
                        updateDraft(
                          "inventory_defaults",
                          "low_stock_threshold",
                          e.target.valueAsNumber,
                        )
                      }
                      className="miro-input"
                    />
                  )}
                </FormField>
                <FormField
                  label={he ? "מדיניות חוסר במלאי" : "Out of Stock Policy"}
                  description={
                    he
                      ? "חל על מוצרים המוגדרים לרשת את ברירת המחדל של החנות."
                      : "Applies to products set to inherit the store default."
                  }
                >
                  {({ id, "aria-describedby": ariaDescribedBy }) => (
                    <select
                      id={id}
                      aria-describedby={ariaDescribedBy}
                      value={inventoryDraft.out_of_stock_policy}
                      onChange={(e) =>
                        updateDraft(
                          "inventory_defaults",
                          "out_of_stock_policy",
                          e.target
                            .value as InventoryDefaults["out_of_stock_policy"],
                        )
                      }
                      className="miro-input"
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
              </fieldset>
              {isCeo && (
                <SettingsFormActions
                  locale={locale}
                  dirty={inventoryDirty}
                  saving={!!saving.inventory_defaults}
                  saveLabel={
                    he ? "שמירת הגדרות מלאי" : "Save Inventory Settings"
                  }
                  onDiscard={() => discardDraft("inventory_defaults")}
                />
              )}
              {inventoryState.notice && (
                <Notice tone={inventoryState.notice.tone} className="mt-3">
                  {inventoryState.notice.text}
                </Notice>
              )}
            </form>
          )}
        </div>
      </FormSection>

      <FormSection
        sectionId="settings-finance"
        icon={<DollarSign size={19} aria-hidden="true" />}
        title={he ? "מדיניות מחירים ומסמכים" : "Pricing and document policy"}
        description={
          he
            ? "מחירי החנות מוצגים בשקלים חדשים וכוללים מע״מ כאשר הוא חל."
            : "Storefront prices are displayed in Israeli shekels and include VAT where it applies."
        }
      >
        <div className="flex flex-wrap gap-2">
          <a href="#settings-tax" className="mgmt-button mgmt-button--ghost">
            {he ? "שיעורי מע״מ" : "VAT rates"}
          </a>
          <Link
            href={withLocale(locale, "admin/integrations#business-identity")}
            className="mgmt-button mgmt-button--ghost"
          >
            {he ? "זהות העסק ומסמכים" : "Business identity and documents"}
          </Link>
        </div>
      </FormSection>
      {/* Public Contact Settings Section */}
      <FormSection
        sectionId="settings-contact"
        icon={<Building2 size={19} aria-hidden="true" />}
        title={he ? "פרטי קשר ציבוריים" : "Public Contact Info"}
        description={
          he
            ? "טלפון, וואטסאפ, אימייל, כתובת ושעות הפתיחה שמוצגים ללקוחות באתר."
            : "Phone, WhatsApp, email, address and opening hours shown to visitors."
        }
        actions={refreshSaved}
      >
        <div className="settings-section-content">
          <p className="text-sm text-muted-foreground">
            {he
              ? "לפרטי התקשרות שמודפסים במסמכים רשמיים, פתחו את "
              : "For contact details on official documents, open "}
            <Link
              href={withLocale(locale, "admin/integrations#business-identity")}
              className="underline underline-offset-4"
            >
              {he ? "זהות העסק" : "Business identity"}
            </Link>
            {"."}
          </p>
          {isCeo && (
            <p className="text-sm text-muted-foreground">
              {he
                ? "כדי להסתיר פרט באתר, נקו את השדה ושמרו."
                : "Clear a field and save to hide it on the website."}
            </p>
          )}
          {settingsLoading ? (
            <FormSkeleton
              fields={7}
              label={he ? "טוען הגדרות…" : "Loading settings…"}
            />
          ) : settingsError ? (
            loadError
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSettingsSubmit("public_contact");
              }}
            >
              <fieldset
                disabled={!isCeo || saving.public_contact}
                className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
              >
                <FormField
                  label={he ? "טלפון" : "Phone"}
                  description={
                    he
                      ? "ספרות בלבד, אפשר להתחיל ב-+"
                      : "Digits with an optional leading +"
                  }
                >
                  {({ id, "aria-describedby": ariaDescribedBy }) => (
                    <input
                      type="tel"
                      id={id}
                      aria-describedby={ariaDescribedBy}
                      dir="ltr"
                      maxLength={20}
                      value={publicContactDraft.phone}
                      onChange={(e) =>
                        updateDraft("public_contact", "phone", e.target.value)
                      }
                      className="miro-input"
                      placeholder="+972501234567"
                    />
                  )}
                </FormField>
                <FormField
                  label={he ? "וואטסאפ" : "WhatsApp"}
                  description={
                    he
                      ? "מספר בינלאומי עם קידומת מדינה, ספרות בלבד"
                      : "International number with country code, digits only"
                  }
                >
                  {({ id, "aria-describedby": ariaDescribedBy }) => (
                    <input
                      type="tel"
                      id={id}
                      aria-describedby={ariaDescribedBy}
                      dir="ltr"
                      maxLength={15}
                      value={publicContactDraft.whatsapp}
                      onChange={(e) =>
                        updateDraft(
                          "public_contact",
                          "whatsapp",
                          e.target.value,
                        )
                      }
                      className="miro-input"
                      placeholder="972501234567"
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
                      dir="ltr"
                      maxLength={254}
                      value={publicContactDraft.email}
                      onChange={(e) =>
                        updateDraft("public_contact", "email", e.target.value)
                      }
                      className="miro-input"
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
                      dir="rtl"
                      maxLength={300}
                      value={publicContactDraft.address_he}
                      onChange={(e) =>
                        updateDraft(
                          "public_contact",
                          "address_he",
                          e.target.value,
                        )
                      }
                      className="miro-input"
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
                      dir="ltr"
                      maxLength={300}
                      value={publicContactDraft.address_en}
                      onChange={(e) =>
                        updateDraft(
                          "public_contact",
                          "address_en",
                          e.target.value,
                        )
                      }
                      className="miro-input"
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
                      dir="rtl"
                      maxLength={200}
                      value={publicContactDraft.hours_he}
                      onChange={(e) =>
                        updateDraft(
                          "public_contact",
                          "hours_he",
                          e.target.value,
                        )
                      }
                      className="miro-input"
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
                      dir="ltr"
                      maxLength={200}
                      value={publicContactDraft.hours_en}
                      onChange={(e) =>
                        updateDraft(
                          "public_contact",
                          "hours_en",
                          e.target.value,
                        )
                      }
                      className="miro-input"
                      placeholder="Mon-Fri 09:00-18:00"
                    />
                  )}
                </FormField>
              </fieldset>
              {isCeo && (
                <SettingsFormActions
                  locale={locale}
                  dirty={contactDirty}
                  saving={!!saving.public_contact}
                  saveLabel={he ? "שמירת פרטי קשר" : "Save Contact Info"}
                  onDiscard={() => discardDraft("public_contact")}
                />
              )}
              {publicContactState.notice && (
                <Notice tone={publicContactState.notice.tone} className="mt-3">
                  {publicContactState.notice.text}
                </Notice>
              )}
            </form>
          )}
        </div>
      </FormSection>
    </div>
  );
}
