"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";

type AuditEvent = {
  id: string;
  action: string;
  user_id: string;
  details: Record<string, unknown>;
  created_at: string;
  profiles: { full_name: string | null } | null;
};

export function AuditHistory({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    userId: "" as string | null,
    action: "" as string | null,
    limit: 50,
    offset: 0,
  });
  const [totalCount, setTotalCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const actions = [
    "product_created",
    "product_updated",
    "product_deleted",
    "category_created",
    "category_updated",
    "category_deleted",
    "product_price_set",
    "product_price_deleted",
    "product_image_added",
    "product_image_updated",
    "product_image_deleted",
    "account_control",
    "ceo_added",
    "ceo_self_deleted",
    "request_update",
  ] as const;

  const actionLabels: Record<string, string> = he
    ? {
        product_created: "נוצר מוצר",
        product_updated: "עודכן מוצר",
        product_deleted: "נמחק מוצר",
        category_created: "נוצרה קטגוריה",
        category_updated: "עודכן קטגוריה",
        category_deleted: "נמחקה קטגוריה",
        product_price_set: "נקבע מחיר מוצר",
        product_price_deleted: "נמחק מחיר מוצר",
        product_image_added: "נוספה תמונת מוצר",
        product_image_updated: "עודכנה תמונת מוצר",
        product_image_deleted: "נמחקה תמונת מוצר",
        account_control: "פקדון חשבון",
        ceo_added: "נוסף מנכ״ל",
        ceo_self_deleted: "נמחק מנכ״ל עצמי",
        request_update: "עודכן שירות",
      }
    : {
        product_created: "Product Created",
        product_updated: "Product Updated",
        product_deleted: "Product Deleted",
        category_created: "Category Created",
        category_updated: "Category Updated",
        category_deleted: "Category Deleted",
        product_price_set: "Product Price Set",
        product_price_deleted: "Product Price Deleted",
        product_image_added: "Product Image Added",
        product_image_updated: "Product Image Updated",
        product_image_deleted: "Product Image Deleted",
        account_control: "Account Control",
        ceo_added: "CEO Added",
        ceo_self_deleted: "CEO Self Deleted",
        request_update: "Request Updated",
      };

  const loadAuditHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const queryParams = new URLSearchParams();
      if (filters.userId) queryParams.append("userId", filters.userId);
      if (filters.action) queryParams.append("action", filters.action);
      queryParams.append("limit", String(filters.limit));
      queryParams.append("offset", String(filters.offset));

      const response = await fetch(
        `/api/management/audit?${queryParams.toString()}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to load audit history");
      }

      const { auditEvents: events, totalCount } = await response.json();
      setAuditEvents(events);
      setTotalCount(totalCount);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : he
            ? "שגיאה בטעינה"
            : "Load failed",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters.userId, filters.action, filters.limit, filters.offset, he]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAuditHistory();
  }, [loadAuditHistory]);

  const handleFilterChange = (field: string, value: string | null) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
      offset: 0, // Reset offset when filters change
    }));
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadAuditHistory();
  };

  const handleLoadMore = () => {
    setFilters((prev) => ({
      ...prev,
      offset: prev.limit + prev.offset,
    }));
  };

  if (loading) {
    return (
      <div className="miro-card p-12 text-center">
        <div className="flex items-center justify-center mb-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
        </div>
        <p className="text-muted-foreground">
          {he ? "מטעינה היסטוריית ביקורת..." : "Loading audit history..."}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="miro-card border-destructive/50 bg-destructive/5 p-6">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 text-destructive">
            {/* Simple alert icon */}
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <span className="text-destructive">{error}</span>
        </div>
      </div>
    );
  }

  if (auditEvents.length === 0 && totalCount === 0) {
    return (
      <div className="miro-card p-8 text-center">
        <p className="text-muted-foreground">
          {he ? "אין רשומות ביקורת להצגה" : "No audit records to display"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="miro-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">
              {he ? "היסטוריית ביקורת" : "Audit History"}
            </h2>
            <p className="mt-1 text-muted-foreground">
              {he
                ? `הצגת ${totalCount} רשומות ביקורת`
                : `Showing ${totalCount} audit records`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              className="miro-button miro-button-secondary"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                </>
              )}
              <span className="ml-2">{he ? "רענן" : "Refresh"}</span>
            </button>
          </div>
        </div>

        <div className="mt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium mb-2">
                {he ? "משתמש" : "User"}
              </label>
              <select
                value={filters.userId ?? ""}
                onChange={(e) =>
                  handleFilterChange("userId", e.target.value || null)
                }
                className="miro-input"
              >
                <option value="">{he ? "הכל" : "All"}</option>
                {/* In a real app, you'd fetch users here */}
                <option value="1">Demo User 1</option>
                <option value="2">Demo User 2</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                {he ? "פעולה" : "Action"}
              </label>
              <select
                value={filters.action ?? ""}
                onChange={(e) =>
                  handleFilterChange("action", e.target.value || null)
                }
                className="miro-input"
              >
                <option value="">{he ? "הכל" : "All"}</option>
                {actions.map((action) => (
                  <option key={action} value={action}>
                    {actionLabels[action]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="miro-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border-subtle text-sm">
            <caption className="sr-only">
              {he ? "טבלת היסטוריית ביקורת" : "Audit history table"}
            </caption>
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {he ? "תאריך" : "Date"}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {he ? "משתמש" : "User"}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {he ? "פעולה" : "Action"}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {he ? "פרטים" : "Details"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {auditEvents.map((event) => (
                <tr key={event.id} className="hover:bg-surface-muted/50">
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(event.created_at).toLocaleString(
                      he ? "he-IL" : "en-US",
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {event.profiles?.full_name || event.user_id || he
                      ? "לא ידוע"
                      : "Unknown"}
                  </td>
                  <td className="px-4 py-3 text-sm text-capitalize font-medium">
                    {actionLabels[event.action] || event.action}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {/* Simplified details display */}
                    {JSON.stringify(event.details)
                      .replace(/[{}]/g, "")
                      .replace(/"/g, "").length > 50
                      ? `${JSON.stringify(event.details)
                          .replace(/[{}]/g, "")
                          .replace(/"/g, "")
                          .substring(0, 50)}...`
                      : JSON.stringify(event.details)
                          .replace(/[{}]/g, "")
                          .replace(/"/g, "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {auditEvents.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground">
            <div>
              Showing {auditEvents.length} of {totalCount} records
            </div>
            {totalCount > filters.limit + filters.offset && (
              <button
                className="miro-button miro-button-secondary"
                onClick={handleLoadMore}
              >
                {he ? "הטען עוד" : "Load More"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
