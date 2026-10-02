"use client";

import { CollectionSummary } from "./ui/collection-summary";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Edit,
  Trash2,
  RotateCcw,
  Building2,
  Clock,
  Coins,
  CheckCircle,
} from "lucide-react";
import {
  OverflowText,
  IconAction,
  ActivationSwitch,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  Dialog,
  ConfirmationDialog,
  Notice,
  PageHeader,
} from "@/components/management/ui";
import type { Locale } from "@/lib/i18n";

type Supplier = {
  id: string;
  company_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  default_lead_time_days: number | null;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type SupplierFormData = {
  company_name: string;
  contact_person: string;
  phone: string;
  email: string;
  notes: string;
  default_lead_time_days: number | null;
  currency: string;
  is_active: boolean;
};

const currencies = ["ILS", "USD", "EUR", "GBP"] as const;

const getCurrencyLabel = (code: string, locale: Locale) => {
  const labels: Record<string, { he: string; en: string }> = {
    ILS: { he: "שקל חדש (₪)", en: "Israeli Shekel (₪)" },
    USD: { he: "דולר אמריקאי ($)", en: "US Dollar ($)" },
    EUR: { he: "אירו (€)", en: "Euro (€)" },
    GBP: { he: "לירה שטרלינג (£)", en: "British Pound (£)" },
  };
  const label = labels[code] ?? { he: code, en: code };
  return locale === "he" ? label.he : label.en;
};

export function SuppliersManager({ locale }: { locale: Locale }) {
  const he = locale === "he";
  const [busy, setBusy] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success",
  );
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<SupplierFormData>({
    company_name: "",
    contact_person: "",
    phone: "",
    email: "",
    notes: "",
    default_lead_time_days: null,
    currency: "ILS",
    is_active: true,
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    text: string;
  } | null>(null);

  // Load suppliers with proper error handling
  const loadSuppliers = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoadError("");
      setLoadError("");
      try {
        const response = await fetch("/api/management/suppliers", {
          cache: "no-store",
        });
        const data = await response.json();
        if (response.ok) {
          setSuppliers(data.suppliers ?? []);
          setLoadError("");
        } else {
          setLoadError(
            data.error ||
              (he ? "לא ניתן לטעון ספקים" : "Unable to load suppliers"),
          );
        }
      } catch {
        setLoadError(he ? "שגיאת חיבור" : "Connection error");
      } finally {
        if (showLoading) setBusy(false);
      }
    },
    [he],
  );

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const response = await fetch("/api/management/suppliers", {
          cache: "no-store",
        });
        if (!ignore && response.ok) {
          const data = await response.json();
          if (!ignore) setSuppliers(data.suppliers ?? []);
        } else if (!ignore) {
          const data = await response.json().catch(() => ({}));
          setLoadError(
            data.error ||
              (he ? "לא ניתן לטעון ספקים" : "Unable to load suppliers"),
          );
        }
      } catch {
        if (!ignore) setLoadError(he ? "שגיאת חיבור" : "Connection error");
      } finally {
        if (!ignore) setBusy(false);
      }
    }
    void init();
    return () => {
      ignore = true;
    };
  }, [he]);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(""), 5000);
  };

  const resetForm = () => {
    setFormData({
      company_name: "",
      contact_person: "",
      phone: "",
      email: "",
      notes: "",
      default_lead_time_days: null,
      currency: "ILS",
      is_active: true,
    });
    setEditingSupplier(null);
    setFormError("");
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (supplier: Supplier) => {
    setFormData({
      company_name: supplier.company_name,
      contact_person: supplier.contact_person ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      notes: supplier.notes ?? "",
      default_lead_time_days: supplier.default_lead_time_days,
      currency: supplier.currency,
      is_active: supplier.is_active,
    });
    setEditingSupplier(supplier);
    setFormError("");
    setShowForm(true);
  };

  const handleFormChange = (
    field: keyof SupplierFormData,
    value: string | number | boolean | null,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const submitForm = async () => {
    setBusy(true);
    setFormError("");
    try {
      const method = editingSupplier ? "PATCH" : "POST";
      const url = "/api/management/suppliers";
      const leadTimeValue = formData.default_lead_time_days;
      const body = {
        ...(editingSupplier ? { id: editingSupplier.id } : {}),
        ...formData,
        default_lead_time_days:
          leadTimeValue === null || leadTimeValue === undefined
            ? null
            : leadTimeValue,
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || (he ? "שמירה נכשלה" : "Save failed"));
      }

      showToast(
        he
          ? editingSupplier
            ? "הספק עודכן"
            : "הספק נוסף"
          : editingSupplier
            ? "Supplier updated"
            : "Supplier added",
      );
      setShowForm(false);
      resetForm();
      await loadSuppliers();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : he
            ? "שגיאה בשמירה"
            : "Save failed",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deleteConfirm?.text?.trim().toUpperCase() !== "DELETE") {
      showToast(
        he ? "הקלידו DELETE לאישור" : "Type DELETE to confirm",
        "error",
      );
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/management/suppliers?id=${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (response.ok) {
        showToast(
          data.deactivated
            ? he
              ? "הספק הושבת (יש הפניות במוצרים)"
              : "Supplier deactivated (referenced by products)"
            : he
              ? "הספק נמחק"
              : "Supplier deleted",
        );
        setDeleteConfirm(null);
        await loadSuppliers();
      } else {
        showToast(
          data.error || (he ? "מחיקה נכשלה" : "Delete failed"),
          "error",
        );
      }
    } catch {
      showToast(he ? "שגיאת חיבור" : "Connection error", "error");
    } finally {
      setBusy(false);
    }
  };

  const startDeleteConfirm = (id: string) => {
    setDeleteConfirm({ id, text: "" });
  };

  const clearDeleteConfirm = () => setDeleteConfirm(null);

  const toggleActive = async (supplier: Supplier, newActive: boolean) => {
    setBusy(true);
    try {
      const response = await fetch("/api/management/suppliers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: supplier.id,
          is_active: newActive,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        showToast(
          newActive
            ? he
              ? "הספק הופעל"
              : "Supplier activated"
            : he
              ? "הספק הושבת"
              : "Supplier deactivated",
        );
        await loadSuppliers();
      } else {
        showToast(data.error || (he ? "עדכון נכשל" : "Update failed"), "error");
        await loadSuppliers(); // Revert UI
      }
    } catch {
      showToast(he ? "שגיאת חיבור" : "Connection error", "error");
      await loadSuppliers(); // Revert UI
    } finally {
      setBusy(false);
    }
  };

  if (loadError && suppliers.length === 0) {
    return (
      <ErrorState
        title={he ? "שגיאה בטעינת הספקים" : "Failed to load suppliers"}
        description={loadError}
        onRetry={() => loadSuppliers(true)}
        retryLabel={he ? "נסה שוב" : "Retry"}
      />
    );
  }

  return (
    <div className="suppliers-manager space-y-6">
      {message && (
        <Notice
          tone={messageType === "success" ? "success" : "danger"}
          onDismiss={() => setMessage("")}
          dismissLabel={he ? "סגור" : "Close"}
        >
          {message}
        </Notice>
      )}

      <PageHeader
        title={he ? "ניהול ספקים" : "Supplier Management"}
        subtitle={
          he
            ? "צפייה, הוספה, עריכה ומחיקה של ספקים"
            : "View, add, edit, and delete suppliers"
        }
        actions={
          <button
            className="miro-button miro-button-primary"
            onClick={openCreateForm}
            disabled={busy}
          >
            <Plus className="me-2 h-4 w-4" />
            {he ? "הוסף ספק" : "Add Supplier"}
          </button>
        }
      />

      <CollectionSummary
        items={[
          {
            label: he ? "ספקים שנטענו" : "Loaded suppliers",
            value: suppliers.length,
          },
          {
            label: he ? "פעילים" : "Active",
            value: suppliers.filter((supplier) => supplier.is_active).length,
          },
          {
            label: he ? "לא פעילים" : "Inactive",
            value: suppliers.filter((supplier) => !supplier.is_active).length,
          },
          {
            label: he ? "עם פרטי קשר" : "With contact details",
            value: suppliers.filter(
              (supplier) => supplier.phone || supplier.email,
            ).length,
          },
        ]}
        scope={
          he
            ? "סיכום הספקים המוצגים בעמוד זה."
            : "Summary of suppliers on this page."
        }
      />

      <section className="miro-card">
        {suppliers.length === 0 ? (
          <EmptyState
            icon={<Building2 size={24} />}
            title={he ? "אין ספקים במערכת" : "No suppliers in the system"}
            description={
              he
                ? "לחצו על 'הוסף ספק' כדי להתחיל"
                : "Click 'Add Supplier' to get started"
            }
            action={
              <button
                className="miro-button miro-button-primary"
                onClick={openCreateForm}
              >
                {he ? "הוסף ספק" : "Add Supplier"}
              </button>
            }
          />
        ) : (
          <>
            {/* Desktop Table (≥768px) */}
            <div className="hidden md:block">
              <DataTable
                columnWidths={[
                  "16%",
                  "12%",
                  "12%",
                  "18%",
                  "9%",
                  "13%",
                  "8%",
                  "12%",
                ]}
                minWidth="80rem"
                tableClassName="mgmt-supplier-table"
                stickyHeader
                caption={he ? "טבלת ניהול ספקים" : "Supplier management table"}
                isEmpty={suppliers.length === 0}
                emptyState={
                  <EmptyState
                    compact
                    title={
                      he ? "אין ספקים במערכת" : "No suppliers in the system"
                    }
                  />
                }
                head={
                  <tr>
                    <th scope="col">{he ? "שם חברה" : "Company Name"}</th>
                    <th scope="col">{he ? "איש קשר" : "Contact Person"}</th>
                    <th scope="col">{he ? "טלפון" : "Phone"}</th>
                    <th scope="col">{he ? "אימייל" : "Email"}</th>
                    <th scope="col">
                      {he ? "זמן אספקה (ימים)" : "Lead Time (days)"}
                    </th>
                    <th scope="col">{he ? "מטבע" : "Currency"}</th>
                    <th scope="col">{he ? "סטטוס" : "Status"}</th>
                    <th scope="col">{he ? "פעולות" : "Actions"}</th>
                  </tr>
                }
              >
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td className="p-4">
                      <div className="mgmt-supplier-company">
                        <Building2
                          className="h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <OverflowText
                          className="font-medium"
                          text={supplier.company_name}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        {supplier.id.slice(0, 8)}…
                      </p>
                    </td>
                    <td className="p-4">
                      {supplier.contact_person ? (
                        <OverflowText text={supplier.contact_person} />
                      ) : (
                        <span className="text-muted-foreground">
                          {he ? "לא צוין" : "Not specified"}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {supplier.phone ? (
                        <a
                          href={`tel:${supplier.phone}`}
                          className="text-primary hover:underline"
                        >
                          {supplier.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-4">
                      {supplier.email ? (
                        <a
                          href={`mailto:${supplier.email}`}
                          className="text-primary hover:underline"
                        >
                          <OverflowText
                            text={supplier.email}
                            dir="ltr"
                            focusable={false}
                          />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-4">
                      {supplier.default_lead_time_days !== null ? (
                        <span className="mgmt-data-chip">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {supplier.default_lead_time_days}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="mgmt-data-chip">
                        <Coins className="h-3 w-3" aria-hidden="true" />
                        {getCurrencyLabel(supplier.currency, locale)}
                      </span>
                    </td>
                    <td className="p-4">
                      <ActivationSwitch
                        active={supplier.is_active}
                        disabled={busy}
                        label={
                          supplier.is_active
                            ? he
                              ? "פעיל · השבת ספק"
                              : "Active · Deactivate supplier"
                            : he
                              ? "לא פעיל · הפעל ספק"
                              : "Inactive · Activate supplier"
                        }
                        onClick={() =>
                          void toggleActive(supplier, !supplier.is_active)
                        }
                      />
                    </td>
                    <td className="p-4">
                      <div className="mgmt-row-actions">
                        <IconAction
                          label={he ? "ערוך ספק" : "Edit supplier"}
                          onClick={() => openEditForm(supplier)}
                          disabled={busy}
                        >
                          <Edit size={17} aria-hidden="true" />
                        </IconAction>
                        <IconAction
                          label={he ? "מחיקת ספק" : "Delete supplier"}
                          tone="danger"
                          onClick={() => startDeleteConfirm(supplier.id)}
                          disabled={busy}
                        >
                          <Trash2 size={17} aria-hidden="true" />
                        </IconAction>
                      </div>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </div>

            {/* Mobile Card View (<768px) */}
            <div className="md:hidden">
              <div className="space-y-4" role="list">
                {suppliers.map((supplier) => (
                  <div
                    key={supplier.id}
                    className="miro-card p-4"
                    role="listitem"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <Building2
                          className="h-5 w-5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <p className="font-semibold">{supplier.company_name}</p>
                      </div>
                      <ActivationSwitch
                        active={supplier.is_active}
                        disabled={busy}
                        label={
                          supplier.is_active
                            ? he
                              ? "פעיל · השבת ספק"
                              : "Active · Deactivate supplier"
                            : he
                              ? "לא פעיל · הפעל ספק"
                              : "Inactive · Activate supplier"
                        }
                        onClick={() =>
                          void toggleActive(supplier, !supplier.is_active)
                        }
                      />
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex flex-wrap gap-2">
                        <span className="text-muted-foreground min-w-[80px]">
                          {he ? "איש קשר:" : "Contact:"}
                        </span>
                        <span>
                          {supplier.contact_person ||
                            (he ? "לא צוין" : "Not specified")}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-muted-foreground min-w-[80px]">
                          {he ? "טלפון:" : "Phone:"}
                        </span>
                        <span>
                          {supplier.phone ? (
                            <a
                              href={`tel:${supplier.phone}`}
                              className="text-primary hover:underline"
                            >
                              {supplier.phone}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-muted-foreground min-w-[80px]">
                          {he ? "אימייל:" : "Email:"}
                        </span>
                        <span>
                          {supplier.email ? (
                            <a
                              href={`mailto:${supplier.email}`}
                              className="text-primary hover:underline"
                            >
                              {supplier.email}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-muted-foreground min-w-[80px]">
                          {he ? "זמן אספקה:" : "Lead Time:"}
                        </span>
                        <span>
                          {supplier.default_lead_time_days !== null ? (
                            `${supplier.default_lead_time_days} ${he ? "ימים" : "days"}`
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-muted-foreground min-w-[80px]">
                          {he ? "מטבע:" : "Currency:"}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border">
                          <Coins className="h-3 w-3" aria-hidden="true" />
                          {getCurrencyLabel(supplier.currency, locale)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-muted-foreground min-w-[80px]">
                          {he ? "הערות:" : "Notes:"}
                        </span>
                        <span>
                          {supplier.notes || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border-subtle">
                      <button
                        className="miro-button miro-button-secondary text-sm flex-1 min-w-0"
                        onClick={() => openEditForm(supplier)}
                        disabled={busy}
                      >
                        <Edit className="h-4 w-4" aria-hidden="true" />
                        {he ? "עריכה" : "Edit"}
                      </button>
                      <button
                        className="miro-button miro-button-secondary text-sm text-destructive hover:bg-destructive/10 flex-1 min-w-0"
                        onClick={() => startDeleteConfirm(supplier.id)}
                        disabled={busy}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        {he ? "מחיקה" : "Delete"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-border-subtle">
              <p className="text-sm text-muted-foreground">
                {he
                  ? `מוצגים ${suppliers.length} ספקים`
                  : `Showing ${suppliers.length} suppliers`}
              </p>
            </div>
          </>
        )}

        {/* Add/Edit Form Dialog */}
        <Dialog
          open={showForm}
          onClose={() => {
            setShowForm(false);
            resetForm();
          }}
          title={
            editingSupplier
              ? he
                ? "ערוך ספק"
                : "Edit Supplier"
              : he
                ? "הוסף ספק"
                : "Add Supplier"
          }
          size="lg"
          footer={
            <div className="mgmt-dialog__actions">
              <button
                type="button"
                className="mgmt-button mgmt-button--ghost"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                disabled={busy}
              >
                {he ? "ביטול" : "Cancel"}
              </button>
              <button
                type="button"
                className="mgmt-button mgmt-button--primary"
                onClick={() => void submitForm()}
                disabled={busy}
                aria-busy={busy || undefined}
              >
                {busy ? (
                  <>
                    <RotateCcw className="me-2 h-4 w-4 animate-spin" />
                    {he ? "שומר..." : "Saving..."}
                  </>
                ) : (
                  <>
                    <CheckCircle className="me-2 h-4 w-4" />
                    {he ? "שמור" : "Save"}
                  </>
                )}
              </button>
            </div>
          }
        >
          {formError && (
            <Notice
              tone="danger"
              onDismiss={() => setFormError("")}
              dismissLabel={he ? "סגור" : "Close"}
            >
              {formError}
            </Notice>
          )}
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              void submitForm();
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                id="supplier-company-name"
                label={he ? "שם חברה *" : "Company Name *"}
                required
                error={
                  formError && !formData.company_name
                    ? he
                      ? "נדרש שם חברה"
                      : "Company name required"
                    : undefined
                }
              >
                {(control) => (
                  <input
                    {...control}
                    type="text"
                    className="miro-input"
                    value={formData.company_name}
                    onChange={(e) =>
                      handleFormChange("company_name", e.target.value)
                    }
                    required
                    placeholder={he ? "שם החברה" : "Company name"}
                  />
                )}
              </FormField>
              <FormField
                id="supplier-contact-person"
                label={he ? "איש קשר" : "Contact Person"}
              >
                {(control) => (
                  <input
                    {...control}
                    type="text"
                    className="miro-input"
                    value={formData.contact_person}
                    onChange={(e) =>
                      handleFormChange("contact_person", e.target.value)
                    }
                    placeholder={he ? "שם איש הקשר" : "Contact person name"}
                  />
                )}
              </FormField>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField id="supplier-phone" label={he ? "טלפון" : "Phone"}>
                {(control) => (
                  <input
                    {...control}
                    type="tel"
                    className="miro-input"
                    value={formData.phone}
                    onChange={(e) => handleFormChange("phone", e.target.value)}
                    placeholder={he ? "050-1234567" : "050-1234567"}
                  />
                )}
              </FormField>
              <FormField id="supplier-email" label={he ? "אימייל" : "Email"}>
                {(control) => (
                  <input
                    {...control}
                    type="email"
                    className="miro-input"
                    value={formData.email}
                    onChange={(e) => handleFormChange("email", e.target.value)}
                    placeholder="email@example.com"
                  />
                )}
              </FormField>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                id="supplier-lead-time"
                label={
                  he
                    ? "זמן אספקה ברירת מחדל (ימים)"
                    : "Default Lead Time (days)"
                }
              >
                {(control) => (
                  <input
                    {...control}
                    type="number"
                    min="0"
                    className="miro-input"
                    value={formData.default_lead_time_days ?? ""}
                    onChange={(e) =>
                      handleFormChange(
                        "default_lead_time_days",
                        e.target.value ? parseInt(e.target.value, 10) : null,
                      )
                    }
                    placeholder={he ? "למשל: 7" : "e.g. 7"}
                  />
                )}
              </FormField>
              <FormField
                id="supplier-currency"
                label={he ? "מטבע" : "Currency"}
              >
                {(control) => (
                  <select
                    {...control}
                    className="miro-input"
                    value={formData.currency}
                    onChange={(e) =>
                      handleFormChange("currency", e.target.value)
                    }
                  >
                    {currencies.map((curr) => (
                      <option key={curr} value={curr}>
                        {getCurrencyLabel(curr, locale)}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            </div>

            <FormField id="supplier-notes" label={he ? "הערות" : "Notes"}>
              {(control) => (
                <textarea
                  {...control}
                  className="miro-input"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => handleFormChange("notes", e.target.value)}
                  placeholder={
                    he
                      ? "הערות פנימיות על הספק..."
                      : "Internal notes about supplier..."
                  }
                />
              )}
            </FormField>

            <FormField
              id="supplier-active"
              label={
                <span className="flex items-center gap-2">
                  {he ? "פעיל" : "Active"}
                </span>
              }
            >
              {(control) => (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    {...control}
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) =>
                      handleFormChange("is_active", e.target.checked)
                    }
                    className="rounded border-border-subtle"
                  />
                  <span>{he ? "פעיל" : "Active"}</span>
                </label>
              )}
            </FormField>
          </form>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <ConfirmationDialog
          open={!!deleteConfirm}
          onConfirm={() => deleteConfirm && handleDelete(deleteConfirm.id)}
          onCancel={clearDeleteConfirm}
          title={he ? "מחיקת ספק" : "Delete Supplier"}
          description={
            he
              ? "האם אתם בטוחים שברצונכם למחוק ספק זה? ספקים עם הפניות במוצרים יושבתו במקום להימחק."
              : "Are you sure you want to delete this supplier? Suppliers referenced by products will be deactivated instead of deleted."
          }
          confirmLabel={he ? "מחיקה" : "Delete"}
          cancelLabel={he ? "ביטול" : "Cancel"}
          tone="danger"
          busy={busy}
          closeLabel={he ? "סגור" : "Close"}
        />
      </section>
    </div>
  );
}
