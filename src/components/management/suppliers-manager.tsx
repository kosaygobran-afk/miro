"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Edit,
  Trash2,
  RotateCcw,
  AlertCircle,
  ShieldCheck,
  X,
  Building2,
  Phone,
  Mail,
  Clock,
  DollarSign,
  CheckCircle,
} from "lucide-react";

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

export function SuppliersManager({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";
  const [busy, setBusy] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

  const loadSuppliers = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/management/suppliers", {
          cache: "no-store",
        });
        const data = await response.json();
        if (response.ok) {
          setSuppliers(data.suppliers ?? []);
          setError("");
        } else {
          setError(
            data.error ||
              (he ? "לא ניתן לטעון ספקים" : "Unable to load suppliers"),
          );
        }
      } catch {
        setError(he ? "שגיאת חיבור" : "Connection error");
      } finally {
        if (showLoading) setLoading(false);
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
        }
      } catch {
        if (!ignore) setError(he ? "שגיאת חיבור" : "Connection error");
      } finally {
        if (!ignore) setLoading(false);
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
    setError("");
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
      setError(
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

  const updateDeleteConfirm = (text: string) => {
    setDeleteConfirm((prev) => (prev ? { ...prev, text } : null));
  };

  const clearDeleteConfirm = () => setDeleteConfirm(null);

  const getCurrencyLabel = (code: string) => {
    const labels: Record<string, { he: string; en: string }> = {
      ILS: { he: "שקל חדש (₪)", en: "Israeli Shekel (₪)" },
      USD: { he: "דולר אמריקאי ($)", en: "US Dollar ($)" },
      EUR: { he: "אירו (€)", en: "Euro (€)" },
      GBP: { he: "לירה שטרלינג (£)", en: "British Pound (£)" },
    };
    const label = labels[code] ?? { he: code, en: code };
    return he ? label.he : label.en;
  };

  if (loading) {
    return (
      <div
        className="miro-card suppliers-manager__loading"
        role="status"
        aria-live="polite"
      >
        <div className="suppliers-manager__spinner" aria-hidden="true" />
        <p>{he ? "טוען ספקים…" : "Loading suppliers…"}</p>
      </div>
    );
  }

  if (error && suppliers.length === 0) {
    return (
      <div className="suppliers-manager__error" role="alert">
        <AlertCircle
          className="suppliers-manager__error-icon h-5 w-5"
          aria-hidden="true"
        />
        <div className="suppliers-manager__error-content">
          <p className="suppliers-manager__error-title">
            {he ? "שגיאה בטעינת הספקים" : "Failed to load suppliers"}
          </p>
          <p className="suppliers-manager__error-message">{error}</p>
          <button
            className="miro-button miro-button-secondary suppliers-manager__retry-button"
            onClick={() => loadSuppliers(true)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {he ? "נסה שוב" : "Retry"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="suppliers-manager space-y-6">
      <div className="miro-card">
        <div className="border-b border-border-subtle p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">
                {he ? "ניהול ספקים" : "Supplier Management"}
              </h2>
              <p className="mt-1 text-muted-foreground">
                {he
                  ? "צפייה, הוספה, עריכה ומחיקה של ספקים"
                  : "View, add, edit, and delete suppliers"}
              </p>
            </div>
            <button
              className="miro-button miro-button-primary"
              onClick={openCreateForm}
            >
              <Plus className="me-2 h-4 w-4" />
              {he ? "הוסף ספק" : "Add Supplier"}
            </button>
          </div>
          {message && (
            <p className="mt-3 text-sm" role="status" aria-live="polite">
              <span
                className={`suppliers-manager__message ${
                  messageType === "success"
                    ? "suppliers-manager__message--success"
                    : "suppliers-manager__message--error"
                }`}
              >
                {messageType === "success" ? (
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                )}
                {message}
              </span>
            </p>
          )}
        </div>

        {suppliers.length === 0 ? (
          <div className="suppliers-manager__empty" role="status">
            {he ? "אין ספקים במערכת" : "No suppliers in the system"}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="suppliers-manager__table-wrapper">
              <table className="suppliers-manager__table" role="grid">
                <caption className="sr-only">
                  {he ? "טבלת ניהול ספקים" : "Supplier management table"}
                </caption>
                <thead className="suppliers-manager__thead">
                  <tr>
                    <th className="suppliers-manager__th" scope="col">
                      {he ? "שם חברה" : "Company Name"}
                    </th>
                    <th className="suppliers-manager__th" scope="col">
                      {he ? "איש קשר" : "Contact Person"}
                    </th>
                    <th className="suppliers-manager__th" scope="col">
                      {he ? "טלפון" : "Phone"}
                    </th>
                    <th className="suppliers-manager__th" scope="col">
                      {he ? "אימייל" : "Email"}
                    </th>
                    <th className="suppliers-manager__th" scope="col">
                      {he ? "זמן אספקה (ימים)" : "Lead Time (days)"}
                    </th>
                    <th className="suppliers-manager__th" scope="col">
                      {he ? "מטבע" : "Currency"}
                    </th>
                    <th className="suppliers-manager__th" scope="col">
                      {he ? "סטטוס" : "Status"}
                    </th>
                    <th className="suppliers-manager__th" scope="col">
                      {he ? "פעולות" : "Actions"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => (
                    <tr key={supplier.id}>
                      <td className="suppliers-manager__td">
                        <div className="suppliers-manager__supplier-info">
                          <div className="flex items-center gap-2">
                            <Building2
                              className="h-4 w-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <p className="suppliers-manager__supplier-name">
                              {supplier.company_name}
                            </p>
                          </div>
                          <p className="suppliers-manager__supplier-id">
                            {supplier.id.slice(0, 8)}…
                          </p>
                        </div>
                      </td>
                      <td className="suppliers-manager__td">
                        {supplier.contact_person ? (
                          <p>{supplier.contact_person}</p>
                        ) : (
                          <span className="text-muted-foreground">
                            {he ? "לא צוין" : "Not specified"}
                          </span>
                        )}
                      </td>
                      <td className="suppliers-manager__td">
                        {supplier.phone ? (
                          <a
                            href={`tel:${supplier.phone}`}
                            className="suppliers-manager__phone"
                          >
                            <Phone
                              className="h-3 w-3 inline-block align-middle ms-1"
                              aria-hidden="true"
                            />
                            {supplier.phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="suppliers-manager__td">
                        {supplier.email ? (
                          <a
                            href={`mailto:${supplier.email}`}
                            className="suppliers-manager__email"
                          >
                            <Mail
                              className="h-3 w-3 inline-block align-middle ms-1"
                              aria-hidden="true"
                            />
                            {supplier.email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="suppliers-manager__td">
                        {supplier.default_lead_time_days !== null ? (
                          <>
                            <Clock
                              className="h-3 w-3 inline-block align-middle ms-1"
                              aria-hidden="true"
                            />
                            {supplier.default_lead_time_days}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="suppliers-manager__td">
                        <span className="suppliers-manager__currency-badge">
                          <DollarSign
                            className="h-3 w-3 inline-block align-middle ms-1"
                            aria-hidden="true"
                          />
                          {getCurrencyLabel(supplier.currency)}
                        </span>
                      </td>
                      <td className="suppliers-manager__td">
                        <label className="suppliers-manager__toggle">
                          <input
                            type="checkbox"
                            checked={supplier.is_active}
                            onChange={(e) => {
                              const newActive = e.target.checked;
                              handleFormChange("is_active", newActive);
                              // We need to submit just the is_active change
                              setBusy(true);
                              fetch("/api/management/suppliers", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  id: supplier.id,
                                  is_active: newActive,
                                }),
                              })
                                .then(async (response) => {
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
                                    loadSuppliers();
                                  } else {
                                    showToast(
                                      data.error ||
                                        (he ? "עדכון נכשל" : "Update failed"),
                                      "error",
                                    );
                                    loadSuppliers(); // Revert UI
                                  }
                                })
                                .catch(() => {
                                  showToast(
                                    he ? "שגיאת חיבור" : "Connection error",
                                    "error",
                                  );
                                  loadSuppliers(); // Revert UI
                                })
                                .finally(() => setBusy(false));
                            }}
                            disabled={busy}
                            className="suppliers-manager__toggle-input"
                            aria-label={
                              he
                                ? "הפעל/השבת ספק"
                                : "Activate/deactivate supplier"
                            }
                          />
                          <span
                            className="suppliers-manager__toggle-slider"
                            aria-hidden="true"
                          />
                          <span className="suppliers-manager__toggle-label">
                            {supplier.is_active
                              ? he
                                ? "פעיל"
                                : "Active"
                              : he
                                ? "לא פעיל"
                                : "Inactive"}
                          </span>
                        </label>
                      </td>
                      <td className="suppliers-manager__td">
                        <div className="suppliers-manager__actions">
                          <button
                            className="miro-button miro-button-secondary text-sm"
                            onClick={() => openEditForm(supplier)}
                            disabled={busy}
                            aria-label={he ? "ערוך ספק" : "Edit supplier"}
                          >
                            <Edit className="h-3 w-3" aria-hidden="true" />
                            <span className="hidden sm:inline">
                              {he ? "עריכה" : "Edit"}
                            </span>
                          </button>
                          {deleteConfirm?.id === supplier.id ? (
                            <div className="suppliers-manager__delete-confirm">
                              <input
                                type="text"
                                value={deleteConfirm.text}
                                placeholder={
                                  he ? "הקלידו DELETE" : "Type DELETE"
                                }
                                onChange={(e) =>
                                  updateDeleteConfirm(e.target.value)
                                }
                                className="suppliers-manager__delete-input miro-input"
                                autoFocus
                                aria-label={
                                  he ? "אישור מחיקה" : "Confirm deletion"
                                }
                              />
                              <button
                                type="button"
                                disabled={
                                  busy ||
                                  deleteConfirm.text.trim().toUpperCase() !==
                                    "DELETE"
                                }
                                className="miro-button miro-button-secondary text-sm text-destructive"
                                onClick={() => handleDelete(supplier.id)}
                              >
                                {he ? "מחיקה" : "Delete"}
                              </button>
                              <button
                                type="button"
                                className="miro-button miro-button-secondary text-sm text-destructive"
                                onClick={clearDeleteConfirm}
                                aria-label={he ? "ביטול" : "Cancel"}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              className="miro-button miro-button-secondary text-sm text-destructive hover:bg-destructive/10"
                              onClick={() => startDeleteConfirm(supplier.id)}
                              aria-label={he ? "מחיקת ספק" : "Delete supplier"}
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                              <span className="hidden sm:inline">
                                {he ? "מחיקה" : "Delete"}
                              </span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="suppliers-manager__card-list" role="list">
              {suppliers.map((supplier) => (
                <article
                  key={supplier.id}
                  className="suppliers-manager__card"
                  role="listitem"
                >
                  <div className="suppliers-manager__card-header">
                    <div>
                      <div className="flex items-center gap-2">
                        <Building2
                          className="h-5 w-5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <p className="suppliers-manager__card-name">
                          {supplier.company_name}
                        </p>
                      </div>
                      <p className="suppliers-manager__card-id">
                        {supplier.id.slice(0, 8)}…
                      </p>
                    </div>
                    <label className="suppliers-manager__card-toggle">
                      <input
                        type="checkbox"
                        checked={supplier.is_active}
                        onChange={(e) => {
                          const newActive = e.target.checked;
                          setBusy(true);
                          fetch("/api/management/suppliers", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              id: supplier.id,
                              is_active: newActive,
                            }),
                          })
                            .then(async (response) => {
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
                                loadSuppliers();
                              } else {
                                showToast(
                                  data.error ||
                                    (he ? "עדכון נכשל" : "Update failed"),
                                  "error",
                                );
                                loadSuppliers();
                              }
                            })
                            .catch(() => {
                              showToast(
                                he ? "שגיאת חיבור" : "Connection error",
                                "error",
                              );
                              loadSuppliers();
                            })
                            .finally(() => setBusy(false));
                        }}
                        disabled={busy}
                        className="suppliers-manager__toggle-input"
                        aria-label={
                          he ? "הפעל/השבת ספק" : "Activate/deactivate supplier"
                        }
                      />
                      <span
                        className="suppliers-manager__toggle-slider"
                        aria-hidden="true"
                      />
                    </label>
                  </div>
                  <div className="suppliers-manager__card-body">
                    <div className="suppliers-manager__card-field">
                      <span className="suppliers-manager__card-label">
                        {he ? "איש קשר" : "Contact Person"}
                      </span>
                      <span className="suppliers-manager__card-value">
                        {supplier.contact_person || (
                          <span className="text-muted-foreground">
                            {he ? "לא צוין" : "Not specified"}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="suppliers-manager__card-field">
                      <span className="suppliers-manager__card-label">
                        {he ? "טלפון" : "Phone"}
                      </span>
                      <span className="suppliers-manager__card-value">
                        {supplier.phone ? (
                          <a href={`tel:${supplier.phone}`}>{supplier.phone}</a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                    </div>
                    <div className="suppliers-manager__card-field">
                      <span className="suppliers-manager__card-label">
                        {he ? "אימייל" : "Email"}
                      </span>
                      <span className="suppliers-manager__card-value">
                        {supplier.email ? (
                          <a href={`mailto:${supplier.email}`}>
                            {supplier.email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                    </div>
                    <div className="suppliers-manager__card-field">
                      <span className="suppliers-manager__card-label">
                        {he ? "זמן אספקה" : "Lead Time"}
                      </span>
                      <span className="suppliers-manager__card-value">
                        {supplier.default_lead_time_days !== null ? (
                          `${supplier.default_lead_time_days} ${he ? "ימים" : "days"}`
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                    </div>
                    <div className="suppliers-manager__card-field">
                      <span className="suppliers-manager__card-label">
                        {he ? "מטבע" : "Currency"}
                      </span>
                      <span className="suppliers-manager__card-value">
                        <span className="suppliers-manager__currency-badge">
                          <DollarSign
                            className="h-3 w-3 inline-block align-middle ms-1"
                            aria-hidden="true"
                          />
                          {getCurrencyLabel(supplier.currency)}
                        </span>
                      </span>
                    </div>
                    <div className="suppliers-manager__card-field">
                      <span className="suppliers-manager__card-label">
                        {he ? "הערות" : "Notes"}
                      </span>
                      <span className="suppliers-manager__card-value">
                        {supplier.notes || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="suppliers-manager__card-actions">
                    <button
                      className="miro-button miro-button-secondary text-sm"
                      onClick={() => openEditForm(supplier)}
                      disabled={busy}
                    >
                      <Edit className="h-4 w-4" aria-hidden="true" />
                      {he ? "עריכה" : "Edit"}
                    </button>
                    {deleteConfirm?.id === supplier.id ? (
                      <div
                        className="suppliers-manager__delete-confirm"
                        style={{
                          flex: "1 1 100%",
                          display: "flex",
                          gap: "0.5rem",
                        }}
                      >
                        <input
                          type="text"
                          value={deleteConfirm.text}
                          placeholder={he ? "הקלידו DELETE" : "Type DELETE"}
                          onChange={(e) => updateDeleteConfirm(e.target.value)}
                          className="suppliers-manager__delete-input miro-input"
                          autoFocus
                          aria-label={he ? "אישור מחיקה" : "Confirm deletion"}
                        />
                        <button
                          type="button"
                          disabled={
                            busy ||
                            deleteConfirm.text.trim().toUpperCase() !== "DELETE"
                          }
                          className="miro-button miro-button-secondary text-sm text-destructive"
                          onClick={() => handleDelete(supplier.id)}
                        >
                          {he ? "מחיקה" : "Delete"}
                        </button>
                        <button
                          type="button"
                          className="miro-button miro-button-secondary text-sm text-destructive"
                          onClick={clearDeleteConfirm}
                          aria-label={he ? "ביטול" : "Cancel"}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        className="miro-button miro-button-secondary text-sm text-destructive hover:bg-destructive/10"
                        onClick={() => startDeleteConfirm(supplier.id)}
                        aria-label={he ? "מחיקת ספק" : "Delete supplier"}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        {he ? "מחיקה" : "Delete"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
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

        {/* Add/Edit Modal */}
        {showForm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowForm(false)}
          >
            <div
              className="bg-background rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-border-subtle p-6 flex items-center justify-between">
                <h3 className="text-xl font-black">
                  {editingSupplier
                    ? he
                      ? "ערוך ספק"
                      : "Edit Supplier"
                    : he
                      ? "הוסף ספק"
                      : "Add Supplier"}
                </h3>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setShowForm(false)}
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitForm();
                }}
                className="p-6 space-y-6"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {he ? "שם חברה *" : "Company Name *"}
                    </label>
                    <input
                      type="text"
                      value={formData.company_name}
                      onChange={(e) =>
                        handleFormChange("company_name", e.target.value)
                      }
                      className="miro-input"
                      required
                      placeholder={he ? "שם החברה" : "Company name"}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {he ? "איש קשר" : "Contact Person"}
                    </label>
                    <input
                      type="text"
                      value={formData.contact_person}
                      onChange={(e) =>
                        handleFormChange("contact_person", e.target.value)
                      }
                      className="miro-input"
                      placeholder={he ? "שם איש הקשר" : "Contact person name"}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {he ? "טלפון" : "Phone"}
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        handleFormChange("phone", e.target.value)
                      }
                      className="miro-input"
                      placeholder={he ? "050-1234567" : "050-1234567"}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {he ? "אימייל" : "Email"}
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        handleFormChange("email", e.target.value)
                      }
                      className="miro-input"
                      placeholder="email@example.com"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {he
                        ? "זמן אספקה ברירת מחדל (ימים)"
                        : "Default Lead Time (days)"}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.default_lead_time_days ?? ""}
                      onChange={(e) =>
                        handleFormChange(
                          "default_lead_time_days",
                          e.target.value ? parseInt(e.target.value, 10) : null,
                        )
                      }
                      className="miro-input"
                      placeholder={he ? "למשל: 7" : "e.g. 7"}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {he ? "מטבע" : "Currency"}
                    </label>
                    <select
                      value={formData.currency}
                      onChange={(e) =>
                        handleFormChange("currency", e.target.value)
                      }
                      className="miro-input"
                    >
                      {currencies.map((curr) => (
                        <option key={curr} value={curr}>
                          {getCurrencyLabel(curr)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "הערות" : "Notes"}
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => handleFormChange("notes", e.target.value)}
                    className="miro-input"
                    rows={3}
                    placeholder={
                      he
                        ? "הערות פנימיות על הספק..."
                        : "Internal notes about supplier..."
                    }
                  />
                </div>

                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) =>
                        handleFormChange("is_active", e.target.checked)
                      }
                      className="rounded border-border-subtle"
                    />
                    <span>{he ? "פעיל" : "Active"}</span>
                  </label>
                </div>

                <div className="flex justify-end gap-3 border-t border-border-subtle pt-6">
                  <button
                    type="button"
                    className="miro-button miro-button-secondary"
                    onClick={() => setShowForm(false)}
                  >
                    {he ? "ביטול" : "Cancel"}
                  </button>
                  <button
                    type="submit"
                    className="miro-button miro-button-primary"
                    disabled={busy}
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
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
