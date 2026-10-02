"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, SearchCheck, ScrollText, Eye, X } from "lucide-react";
import {
  DataTable,
  Toolbar,
  PageHeader,
  DateRangePicker,
  dateRangeLabels,
  type DateRangeValue,
  EmptyState,
  ErrorState,
  ListSkeleton,
  IconAction,
  Dialog,
  OverflowText,
  StatusBadge,
} from "./ui";
import { CollectionSummary } from "./ui/collection-summary";
import { useDebouncedValue } from "./use-debounced-value";

type AuditEvent = {
  id: string;
  action: string;
  user_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  profiles: { full_name: string | null } | null;
};

export function AuditHistory({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [range, setRange] = useState<DateRangeValue>({
    preset: "all",
    from: "",
    to: "",
  });
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const debouncedSearch = useDebouncedValue(search, 400);
  const actions = [
    "product_created",
    "product_updated",
    "product_deleted",
    "product_archived",
    "product_published",
    "product_unpublished",
    "category_created",
    "category_updated",
    "category_deleted",
    "product_price_set",
    "product_price_deleted",
    "product_image_added",
    "product_image_updated",
    "product_image_deleted",
    "stock_movement",
    "sale_recorded",
    "variant_set_default",
    "variant_created",
    "variant_updated",
    "variant_deleted",
    "tax_rate_changed",
    "setting_changed",
    "account_control",
    "account_deleted",
    "ceo_added",
    "ceo_self_deleted",
    "request_update",
  ] as const;

  const actionLabels: Record<string, string> = he
    ? {
        product_created: "נוצר מוצר",
        product_updated: "עודכן מוצר",
        product_deleted: "נמחק מוצר",
        product_archived: "מוצר הועבר לארכיון",
        product_published: "פורסם מוצר",
        product_unpublished: "בוטל פרסום מוצר",
        category_created: "נוצרה קטגוריה",
        category_updated: "עודכנה קטגוריה",
        category_deleted: "נמחקה קטגוריה",
        product_price_set: "נקבע מחיר מוצר",
        product_price_deleted: "נמחק מחיר מוצר",
        product_image_added: "נוספה תמונת מוצר",
        product_image_updated: "עודכנה תמונת מוצר",
        product_image_deleted: "נמחקה תמונת מוצר",
        stock_movement: "תנועת מלאי",
        sale_recorded: "נרשמה מכירה",
        variant_set_default: "נקבע וריאנט ברירת מחדל",
        variant_created: "נוצר וריאנט",
        variant_updated: "עודכן וריאנט",
        variant_deleted: "נמחק וריאנט",
        tax_rate_changed: "שונתה שיעור מס",
        setting_changed: "הגדרה שונתה",
        account_control: "בקרת חשבון",
        account_deleted: "נמחק חשבון",
        ceo_added: "נוסף מנכ״ל",
        ceo_self_deleted: "מנכ״ל מחק את עצמו",
        request_update: "עודכן שירות",
      }
    : {
        product_created: "Product Created",
        product_updated: "Product Updated",
        product_deleted: "Product Deleted",
        product_archived: "Product Archived",
        product_published: "Product Published",
        product_unpublished: "Product Unpublished",
        category_created: "Category Created",
        category_updated: "Category Updated",
        category_deleted: "Category Deleted",
        product_price_set: "Product Price Set",
        product_price_deleted: "Product Price Deleted",
        product_image_added: "Product Image Added",
        product_image_updated: "Product Image Updated",
        product_image_deleted: "Product Image Deleted",
        stock_movement: "Stock Movement",
        sale_recorded: "Sale Recorded",
        variant_set_default: "Default Variant Set",
        variant_created: "Variant Created",
        variant_updated: "Variant Updated",
        variant_deleted: "Variant Deleted",
        tax_rate_changed: "Tax Rate Changed",
        setting_changed: "Setting Changed",
        account_control: "Account Control",
        account_deleted: "Account Deleted",
        ceo_added: "CEO Added",
        ceo_self_deleted: "CEO Self Deleted",
        request_update: "Request Updated",
      };

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (action) params.set("action", action);
      if (entityType) params.set("entityType", entityType);
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      try {
        const response = await fetch(`/api/management/audit?${params}`, {
          cache: "no-store",
          signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            he
              ? "לא ניתן לטעון את יומן הביקורת"
              : "Unable to load audit history",
          );
        if (!signal?.aborted) {
          setEvents(data.auditEvents ?? []);
          setTotalCount(data.totalCount ?? 0);
        }
      } catch (failure) {
        if (!signal?.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : he
                ? "שגיאת חיבור"
                : "Connection error",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [
      debouncedSearch,
      action,
      entityType,
      range.from,
      range.to,
      limit,
      offset,
      he,
    ],
  );
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(he ? "he-IL" : "en-GB", {
      timeZone: "Asia/Jerusalem",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const filtered = Boolean(
    search || action || entityType || range.preset !== "all",
  );
  function reset() {
    setSearch("");
    setAction("");
    setEntityType("");
    setRange({ preset: "all", from: "", to: "" });
    setOffset(0);
  }

  return (
    <section className="mgmt-audit-page mgmt-page-stack">
      <PageHeader
        title={he ? "יומן ביקורת" : "Audit history"}
        subtitle={
          he
            ? "מעקב אחר שינויים, פעולות ניהול ורשומות מערכת"
            : "Trace management changes, actions and system records"
        }
        actions={
          <button
            type="button"
            className="mgmt-button mgmt-button--ghost"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={18} aria-hidden="true" />
            {he ? "רענון" : "Refresh"}
          </button>
        }
      />
      <CollectionSummary
        items={[
          {
            label: he ? "רשומות תואמות" : "Matching records",
            value: loading ? "—" : totalCount,
          },
          {
            label: he ? "בעמוד הנוכחי" : "On this page",
            value: loading ? "—" : events.length,
          },
          {
            label: he ? "סוגי פעולה בעמוד" : "Action types on this page",
            value: loading
              ? "—"
              : new Set(events.map((event) => event.action)).size,
          },
          {
            label: he ? "סוגי רשומה בעמוד" : "Entity types on this page",
            value: loading
              ? "—"
              : new Set(
                  events.map((event) => event.entity_type).filter(Boolean),
                ).size,
          },
        ]}
      />
      <Toolbar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setOffset(0);
        }}
        searchLabel={he ? "חיפוש ביומן הביקורת" : "Search audit history"}
        searchPlaceholder={
          he
            ? "חיפוש פעולה, סוג רשומה, כתובת או מזהה רשומה…"
            : "Search action, entity, slug or record ID…"
        }
      >
        <label className="mgmt-filter-field">
          <span>{he ? "פעולה" : "Action"}</span>
          <select
            className="miro-input"
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">{he ? "כל הפעולות" : "All actions"}</option>
            {[
              ...new Set<string>([
                ...actions,
                ...events.map((event) => event.action),
              ]),
            ].map((key) => (
              <option key={key} value={key}>
                {actionLabels[key] ?? key.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="mgmt-filter-field">
          <span>{he ? "סוג רשומה" : "Entity"}</span>
          <select
            className="miro-input"
            value={entityType}
            onChange={(event) => {
              setEntityType(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">{he ? "כל הרשומות" : "All entities"}</option>
            {[
              "product",
              "category",
              "service",
              "supplier",
              "variant",
              "user",
              "request",
              "order",
              "setting",
              "tax_rate",
            ].map((key) => (
              <option key={key} value={key}>
                {he
                  ? ({
                      product: "מוצר",
                      category: "קטגוריה",
                      service: "שירות",
                      supplier: "ספק",
                      variant: "וריאנט",
                      user: "משתמש",
                      request: "בקשה",
                      order: "הזמנה",
                      setting: "הגדרה",
                      tax_rate: "שיעור מס",
                    }[key] ?? key)
                  : key.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <DateRangePicker
          value={range}
          labels={dateRangeLabels(locale)}
          onChange={(next) => {
            setRange(next);
            setOffset(0);
          }}
        />
        {filtered ? (
          <button
            type="button"
            className="mgmt-button mgmt-button--ghost"
            onClick={reset}
          >
            <X size={16} aria-hidden="true" />
            {he ? "איפוס מסננים" : "Reset filters"}
          </button>
        ) : null}
      </Toolbar>
      <div className="mgmt-results-bar">
        <span className="mgmt-data-chip">
          <ScrollText size={16} aria-hidden="true" />
          {totalCount.toLocaleString(he ? "he-IL" : "en-GB")}{" "}
          {he ? "רשומות" : "records"}
        </span>
        <span>
          {he ? "התאריכים לפי שעון ישראל" : "Dates shown in Israel time"}
        </span>
      </div>
      {error ? (
        <ErrorState
          title={error}
          onRetry={() => void load()}
          retryLabel={he ? "ניסיון נוסף" : "Retry"}
        />
      ) : loading && events.length === 0 ? (
        <ListSkeleton rows={5} />
      ) : (
        <div aria-busy={loading}>
          <DataTable
            caption={he ? "רשומות ביקורת" : "Audit records"}
            minWidth="70rem"
            tableClassName="mgmt-audit-records"
            isEmpty={events.length === 0}
            emptyState={
              <EmptyState
                icon={<SearchCheck size={24} />}
                title={he ? "לא נמצאו רשומות" : "No matching records"}
                description={
                  he
                    ? "נסו טווח תאריכים או מסננים אחרים"
                    : "Try another date range or reset the filters"
                }
                compact
              />
            }
            head={
              <tr>
                <th scope="col">{he ? "מועד" : "Timestamp"}</th>
                <th scope="col">{he ? "מבצע" : "Actor"}</th>
                <th scope="col">{he ? "פעולה" : "Action"}</th>
                <th scope="col">{he ? "רשומה" : "Entity"}</th>
                <th scope="col">{he ? "פרטים" : "Details"}</th>
                <th scope="col">{he ? "פתיחה" : "Open"}</th>
              </tr>
            }
          >
            {events.map((event) => (
              <tr key={event.id}>
                <td>
                  <time dateTime={event.created_at} dir="ltr">
                    {formatDate(event.created_at)}
                  </time>
                </td>
                <td>
                  <OverflowText
                    text={
                      event.profiles?.full_name ||
                      event.user_id ||
                      (he ? "מערכת" : "System")
                    }
                  />
                </td>
                <td>
                  <StatusBadge tone="neutral">
                    {actionLabels[event.action] ??
                      event.action.replaceAll("_", " ")}
                  </StatusBadge>
                </td>
                <td>
                  <span className="mgmt-table-cell-stack">
                    <span>{event.entity_type ?? "—"}</span>
                    <OverflowText
                      text={event.entity_id ?? "—"}
                      dir="ltr"
                      className="mgmt-identifier"
                    />
                  </span>
                </td>
                <td>
                  <OverflowText
                    text={
                      Object.entries(event.details ?? {})
                        .map(
                          ([key, value]) =>
                            `${key.replaceAll("_", " ")}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`,
                        )
                        .join(" · ") || "—"
                    }
                  />
                </td>
                <td>
                  <IconAction
                    label={he ? "פתיחת רשומת ביקורת" : "Open audit record"}
                    onClick={() => setSelected(event)}
                  >
                    <Eye size={18} aria-hidden="true" />
                  </IconAction>
                </td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}
      <div className="mgmt-list-footer">
        <p aria-live="polite">
          {totalCount
            ? `${offset + 1}–${Math.min(offset + events.length, totalCount)} / ${totalCount}`
            : "0 / 0"}
        </p>
        <label className="mgmt-filter-field">
          <span>{he ? "רשומות בעמוד" : "Rows per page"}</span>
          <select
            className="miro-input"
            value={limit}
            onChange={(event) => {
              setLimit(Number(event.target.value));
              setOffset(0);
            }}
          >
            {[25, 50, 100].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
        <div className="mgmt-row-actions">
          <button
            type="button"
            className="mgmt-button mgmt-button--ghost"
            disabled={loading || offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            {he ? "הקודם" : "Previous"}
          </button>
          <button
            type="button"
            className="mgmt-button mgmt-button--ghost"
            disabled={loading || offset + limit >= totalCount}
            onClick={() => setOffset(offset + limit)}
          >
            {he ? "הבא" : "Next"}
          </button>
        </div>
      </div>
      <Dialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={he ? "פרטי רשומת ביקורת" : "Audit record details"}
        closeLabel={he ? "סגירה" : "Close"}
        size="md"
      >
        {selected ? (
          <dl className="mgmt-audit-details">
            {Object.entries({
              id: selected.id,
              action: selected.action,
              actor: selected.profiles?.full_name ?? selected.user_id,
              timestamp: formatDate(selected.created_at),
              entity: selected.entity_type,
              entity_id: selected.entity_id,
              details: selected.details,
            }).map(([key, value]) => (
              <div key={key}>
                <dt>{key.replaceAll("_", " ")}</dt>
                <dd dir="auto">
                  {typeof value === "object"
                    ? JSON.stringify(value, null, 2)
                    : String(value ?? "—")}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Dialog>
    </section>
  );
}
