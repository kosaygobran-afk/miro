"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  User,
  Eye,
  X,
  Package,
  ClipboardList,
  Activity,
  RotateCcw,
  AlertCircle,
} from "lucide-react";

type Customer = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string;
  account_status: "active" | "suspended" | "blocked";
  role: "customer" | "worker" | "admin" | "ceo";
  created_at: string;
  last_seen_at: string | null;
};

type CustomerDetail = {
  customer: Customer;
  orders: Array<{
    id: string;
    order_number: string;
    status: string;
    total: number;
    subtotal: number;
    vat_total: number;
    currency: string;
    source: string;
    created_at: string;
  }>;
  serviceRequests: Array<{
    id: string;
    service_id: string;
    status: string;
    message: string;
    created_at: string;
  }>;
  events: Array<{
    event_type: string;
    product_id: string | null;
    search_query: string | null;
    created_at: string;
  }>;
};

type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";
type RequestStatus = "open" | "in_progress" | "resolved" | "closed";

export function CustomersManager({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const fetchCustomers = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/management/customers", {
          cache: "no-store",
        });
        const data = await res.json();
        if (res.ok) {
          setCustomers(data.customers ?? []);
        } else {
          setError(
            data.error ||
              (he ? "לא ניתן לטעון לקוחות" : "Unable to load customers"),
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
    // Initial load - use AbortController to avoid setState-in-effect lint issue
    const controller = new AbortController();
    fetch("/api/management/customers", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (!controller.signal.aborted) {
          if (data.customers) {
            setCustomers(data.customers);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(he ? "שגיאת חיבור" : "Connection error");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [he]);

  const fetchCustomerDetail = useCallback(
    async (customerId: string) => {
      setDetailLoading(true);
      setDetailError("");
      try {
        const res = await fetch(`/api/management/customers?id=${customerId}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (res.ok) {
          setSelectedCustomer(data);
        } else {
          setDetailError(
            data.error ||
              (he
                ? "לא ניתן לטעון פרטי לקוח"
                : "Unable to load customer details"),
          );
        }
      } catch {
        setDetailError(he ? "שגיאת חיבור" : "Connection error");
      } finally {
        setDetailLoading(false);
      }
    },
    [he],
  );

  const handleCustomerClick = (customer: Customer) => {
    fetchCustomerDetail(customer.id);
  };

  const closeDetail = () => {
    setSelectedCustomer(null);
    setDetailError("");
  };

  const filteredCustomers = customers.filter((customer) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (customer.full_name?.toLowerCase().includes(q) ?? false) ||
      customer.email.toLowerCase().includes(q) ||
      (customer.phone?.toLowerCase().includes(q) ?? false)
    );
  });

  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(he ? "he-IL" : "en-IL", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : he
        ? "לא זמין"
        : "N/A";

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 2,
    }).format(amount);

  const getStatusBadge = (status: string) => {
    const labels: Record<string, { he: string; en: string }> = {
      active: { he: "פעיל", en: "Active" },
      suspended: { he: "מושהה", en: "Suspended" },
      blocked: { he: "חסום", en: "Blocked" },
    };
    const label = labels[status] ?? { he: status, en: status };
    const variant =
      status === "active"
        ? "status-badge--active"
        : status === "suspended"
          ? "status-badge--suspended"
          : "status-badge--blocked";
    return (
      <span className={`status-badge ${variant}`}>
        {he ? label.he : label.en}
      </span>
    );
  };

  const getRoleBadge = (role: string) => {
    const labels: Record<string, { he: string; en: string }> = {
      ceo: { he: "מנכ״ל", en: "CEO" },
      admin: { he: "מנהל", en: "Admin" },
      worker: { he: "עובד", en: "Worker" },
      customer: { he: "לקוח", en: "Customer" },
    };
    const label = labels[role] ?? { he: role, en: role };
    const variant = `role-badge role-badge--${role}`;
    return <span className={variant}>{he ? label.he : label.en}</span>;
  };

  const getOrderStatusBadge = (status: string) => {
    const labels: Record<OrderStatus, { he: string; en: string }> = {
      pending: { he: "ממתין", en: "Pending" },
      confirmed: { he: "מאושר", en: "Confirmed" },
      processing: { he: "בטיפול", en: "Processing" },
      shipped: { he: "נשלח", en: "Shipped" },
      delivered: { he: "נמסר", en: "Delivered" },
      cancelled: { he: "בוטל", en: "Cancelled" },
      refunded: { he: "הוחזר", en: "Refunded" },
    };
    const label = labels[status as OrderStatus] ?? { he: status, en: status };
    const variant =
      status === "cancelled" || status === "refunded"
        ? "status-badge--blocked"
        : status === "delivered"
          ? "status-badge--active"
          : "status-badge--suspended";
    return (
      <span className={`status-badge ${variant}`}>
        {he ? label.he : label.en}
      </span>
    );
  };

  const getRequestStatusBadge = (status: string) => {
    const labels: Record<RequestStatus, { he: string; en: string }> = {
      open: { he: "פתוח", en: "Open" },
      in_progress: { he: "בטיפול", en: "In Progress" },
      resolved: { he: "נפתר", en: "Resolved" },
      closed: { he: "סגור", en: "Closed" },
    };
    const label = labels[status as RequestStatus] ?? { he: status, en: status };
    const variant =
      status === "resolved" || status === "closed"
        ? "status-badge--active"
        : status === "in_progress"
          ? "status-badge--suspended"
          : "status-badge--suspended";
    return (
      <span className={`status-badge ${variant}`}>
        {he ? label.he : label.en}
      </span>
    );
  };

  // Group events by type
  const productEvents =
    selectedCustomer?.events.filter((e) =>
      [
        "product_view",
        "product_impression",
        "product_contact_click",
        "product_phone_click",
        "product_whatsapp_click",
        "product_inquiry",
      ].includes(e.event_type),
    ) ?? [];
  const searchEvents =
    selectedCustomer?.events.filter((e) =>
      ["product_search", "search_no_result"].includes(e.event_type),
    ) ?? [];

  if (loading) {
    return (
      <div
        className="miro-card customers-manager__loading"
        role="status"
        aria-live="polite"
      >
        <div className="customers-manager__spinner" aria-hidden="true" />
        <p>{he ? "טוען לקוחות…" : "Loading customers…"}</p>
      </div>
    );
  }

  if (error && customers.length === 0) {
    return (
      <div className="miro-card customers-manager__error" role="alert">
        <AlertCircle
          className="h-10 w-10 text-error-text mx-auto mb-3"
          aria-hidden="true"
        />
        <p className="text-lg font-medium mb-2 text-center">
          {he ? "שגיאה בטעינת לקוחות" : "Failed to load customers"}
        </p>
        <p className="text-muted-foreground text-center mb-4">{error}</p>
        <div className="flex justify-center">
          <button
            type="button"
            className="miro-button miro-button-secondary gap-2"
            onClick={() => fetchCustomers(true)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {he ? "נסה שוב" : "Retry"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="customers-manager">
      {/* Main Customers Table */}
      <div className="miro-card">
        <div className="border-b border-border-subtle p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">
                {he ? "ניהול לקוחות" : "Customers Management"}
              </h2>
              <p className="mt-1 text-muted-foreground">
                {he
                  ? "צפייה וניהול פרטי לקוחות, הזמנות ופעילות"
                  : "View and manage customer details, orders, and activity"}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[250px]">
              <Search
                className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  he
                    ? "חפש לפי שם, אימייל או טלפון…"
                    : "Search by name, email or phone…"
                }
                className="miro-input ps-10"
                aria-label={he ? "חיפוש לקוחות" : "Search customers"}
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {he
                ? `מוצגים ${filteredCustomers.length} מתוך ${customers.length} לקוחות`
                : `Showing ${filteredCustomers.length} of ${customers.length} customers`}
            </span>
          </div>
        </div>

        {filteredCustomers.length === 0 ? (
          <div
            className="customers-manager__empty p-8 text-center"
            role="status"
          >
            <User
              className="h-12 w-12 text-muted-foreground mx-auto mb-3"
              aria-hidden="true"
            />
            <p className="text-lg font-medium mb-1">
              {he ? "אין לקוחות תואמים" : "No matching customers"}
            </p>
            <p className="text-muted-foreground">
              {he ? "נסה לשנות את מונח החיפוש" : "Try changing the search term"}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="customers-manager__table-wrapper">
              <table className="customers-manager__table" role="grid">
                <caption className="sr-only">
                  {he ? "טבלת ניהול לקוחות" : "Customer management table"}
                </caption>
                <thead className="customers-manager__thead">
                  <tr>
                    <th className="customers-manager__th" scope="col">
                      {he ? "שם מלא" : "Full name"}
                    </th>
                    <th className="customers-manager__th" scope="col">
                      {he ? "אימייל" : "Email"}
                    </th>
                    <th className="customers-manager__th" scope="col">
                      {he ? "טלפון" : "Phone"}
                    </th>
                    <th className="customers-manager__th" scope="col">
                      {he ? "תפקיד" : "Role"}
                    </th>
                    <th className="customers-manager__th" scope="col">
                      {he ? "מצב" : "Status"}
                    </th>
                    <th className="customers-manager__th" scope="col">
                      {he ? "נוצר" : "Created"}
                    </th>
                    <th className="customers-manager__th" scope="col">
                      {he ? "פעילות אחרונה" : "Last seen"}
                    </th>
                    <th className="customers-manager__th" scope="col">
                      {he ? "פעולות" : "Actions"}
                    </th>
                  </tr>
                </thead>
                <tbody className="customers-manager__tbody">
                  {filteredCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() => handleCustomerClick(customer)}
                      className="customers-manager__row"
                    >
                      <td className="customers-manager__td">
                        <div className="customers-manager__user-info">
                          <p className="customers-manager__user-name">
                            {customer.full_name || (he ? "ללא שם" : "No name")}
                          </p>
                          <p className="customers-manager__user-id">
                            {customer.id.slice(0, 8)}…
                          </p>
                        </div>
                      </td>
                      <td className="customers-manager__td">
                        <a
                          href={`mailto:${customer.email}`}
                          className="customers-manager__email"
                        >
                          {customer.email}
                        </a>
                      </td>
                      <td className="customers-manager__td">
                        {customer.phone ? (
                          <a
                            href={`tel:${customer.phone}`}
                            className="customers-manager__phone"
                          >
                            {customer.phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="customers-manager__td">
                        {getRoleBadge(customer.role)}
                      </td>
                      <td className="customers-manager__td">
                        {getStatusBadge(customer.account_status)}
                      </td>
                      <td className="customers-manager__td">
                        <time dateTime={customer.created_at}>
                          {formatDate(customer.created_at)}
                        </time>
                      </td>
                      <td className="customers-manager__td">
                        <time dateTime={customer.last_seen_at ?? ""}>
                          {formatDate(customer.last_seen_at)}
                        </time>
                      </td>
                      <td className="customers-manager__td">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCustomerClick(customer);
                          }}
                          className="miro-button miro-button-secondary text-sm gap-1"
                          aria-label={
                            he
                              ? `צפה בפרטי ${customer.full_name || customer.email}`
                              : `View details for ${customer.full_name || customer.email}`
                          }
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                          <span className="hidden sm:inline">
                            {he ? "צפייה" : "View"}
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="customers-manager__card-list" role="list">
              {filteredCustomers.map((customer) => (
                <article
                  key={customer.id}
                  className="customers-manager__card"
                  role="listitem"
                  onClick={() => handleCustomerClick(customer)}
                >
                  <div className="customers-manager__card-header">
                    <div>
                      <p className="customers-manager__card-name">
                        {customer.full_name || (he ? "ללא שם" : "No name")}
                      </p>
                      <p className="customers-manager__card-id">
                        {customer.id.slice(0, 8)}…
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getRoleBadge(customer.role)}
                      {getStatusBadge(customer.account_status)}
                    </div>
                  </div>
                  <div className="customers-manager__card-body">
                    <div className="customers-manager__card-field">
                      <span className="customers-manager__card-label">
                        {he ? "אימייל" : "Email"}
                      </span>
                      <a
                        href={`mailto:${customer.email}`}
                        className="customers-manager__card-email"
                      >
                        {customer.email}
                      </a>
                    </div>
                    <div className="customers-manager__card-field">
                      <span className="customers-manager__card-label">
                        {he ? "טלפון" : "Phone"}
                      </span>
                      <span className="customers-manager__card-value">
                        {customer.phone ? (
                          <a href={`tel:${customer.phone}`}>{customer.phone}</a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                    </div>
                    <div className="customers-manager__card-field">
                      <span className="customers-manager__card-label">
                        {he ? "נוצר" : "Created"}
                      </span>
                      <span className="customers-manager__card-value">
                        <time dateTime={customer.created_at}>
                          {formatDate(customer.created_at)}
                        </time>
                      </span>
                    </div>
                    <div className="customers-manager__card-field">
                      <span className="customers-manager__card-label">
                        {he ? "פעילות אחרונה" : "Last seen"}
                      </span>
                      <span className="customers-manager__card-value">
                        <time dateTime={customer.last_seen_at ?? ""}>
                          {formatDate(customer.last_seen_at)}
                        </time>
                      </span>
                    </div>
                  </div>
                  <div className="customers-manager__card-actions">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCustomerClick(customer);
                      }}
                      className="miro-button miro-button-secondary w-full justify-center gap-2"
                    >
                      <Eye className="h-4 w-4" aria-hidden="true" />
                      {he ? "צפה בפרטים" : "View details"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Customer Detail Drawer */}
      {selectedCustomer && (
        <div
          className="customers-manager__drawer-overlay"
          onClick={closeDetail}
          aria-hidden="true"
        />
      )}
      {selectedCustomer && (
        <aside
          className="customers-manager__drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-title"
        >
          <div className="customers-manager__drawer-header">
            <h3 id="drawer-title" className="text-xl font-black">
              {he ? "פרטי לקוח" : "Customer Details"}
            </h3>
            <button
              type="button"
              onClick={closeDetail}
              className="customers-manager__close-btn"
              aria-label={he ? "סגור" : "Close"}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {detailLoading && (
            <div
              className="customers-manager__drawer-loading"
              role="status"
              aria-live="polite"
            >
              <div className="customers-manager__spinner" aria-hidden="true" />
              <p>{he ? "טוען פרטים…" : "Loading details…"}</p>
            </div>
          )}

          {detailError && !detailLoading && (
            <div className="customers-manager__drawer-error p-6" role="alert">
              <AlertCircle
                className="h-10 w-10 text-error-text mx-auto mb-3"
                aria-hidden="true"
              />
              <p className="text-lg font-medium mb-2 text-center">
                {he ? "שגיאה בטעינת פרטים" : "Failed to load details"}
              </p>
              <p className="text-muted-foreground text-center mb-4">
                {detailError}
              </p>
              <div className="flex justify-center">
                <button
                  type="button"
                  className="miro-button miro-button-secondary gap-2"
                  onClick={() =>
                    fetchCustomerDetail(selectedCustomer.customer.id)
                  }
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {he ? "נסה שוב" : "Retry"}
                </button>
              </div>
            </div>
          )}

          {!detailLoading && !detailError && (
            <div className="customers-manager__drawer-content">
              {/* Profile Section */}
              <section className="customers-manager__section">
                <h4 className="customers-manager__section-title flex items-center gap-2">
                  <User className="h-5 w-5" aria-hidden="true" />
                  {he ? "פרופיל" : "Profile"}
                </h4>
                <div className="customers-manager__detail-grid">
                  <div className="customers-manager__detail-field">
                    <span className="customers-manager__detail-label">
                      {he ? "שם מלא" : "Full name"}
                    </span>
                    <span className="customers-manager__detail-value">
                      {selectedCustomer.customer.full_name ||
                        (he ? "לא זמין" : "N/A")}
                    </span>
                  </div>
                  <div className="customers-manager__detail-field">
                    <span className="customers-manager__detail-label">
                      {he ? "אימייל" : "Email"}
                    </span>
                    <a
                      href={`mailto:${selectedCustomer.customer.email}`}
                      className="customers-manager__detail-value customers-manager__email"
                    >
                      {selectedCustomer.customer.email}
                    </a>
                  </div>
                  <div className="customers-manager__detail-field">
                    <span className="customers-manager__detail-label">
                      {he ? "טלפון" : "Phone"}
                    </span>
                    <span className="customers-manager__detail-value">
                      {selectedCustomer.customer.phone ? (
                        <a href={`tel:${selectedCustomer.customer.phone}`}>
                          {selectedCustomer.customer.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">
                          {he ? "לא זמין" : "N/A"}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="customers-manager__detail-field">
                    <span className="customers-manager__detail-label">
                      {he ? "תפקיד" : "Role"}
                    </span>
                    <span className="customers-manager__detail-value">
                      {getRoleBadge(selectedCustomer.customer.role)}
                    </span>
                  </div>
                  <div className="customers-manager__detail-field">
                    <span className="customers-manager__detail-label">
                      {he ? "מצב חשבון" : "Account status"}
                    </span>
                    <span className="customers-manager__detail-value">
                      {getStatusBadge(selectedCustomer.customer.account_status)}
                    </span>
                  </div>
                  <div className="customers-manager__detail-field">
                    <span className="customers-manager__detail-label">
                      {he ? "תאריך הצטרפות" : "Joined"}
                    </span>
                    <time
                      className="customers-manager__detail-value"
                      dateTime={selectedCustomer.customer.created_at}
                    >
                      {formatDate(selectedCustomer.customer.created_at)}
                    </time>
                  </div>
                  <div className="customers-manager__detail-field">
                    <span className="customers-manager__detail-label">
                      {he ? "פעילות אחרונה" : "Last seen"}
                    </span>
                    <time
                      className="customers-manager__detail-value"
                      dateTime={selectedCustomer.customer.last_seen_at ?? ""}
                    >
                      {formatDate(selectedCustomer.customer.last_seen_at)}
                    </time>
                  </div>
                  <div className="customers-manager__detail-field">
                    <span className="customers-manager__detail-label">
                      {he ? "מזהה" : "ID"}
                    </span>
                    <code className="customers-manager__detail-value font-mono text-sm">
                      {selectedCustomer.customer.id}
                    </code>
                  </div>
                </div>
              </section>

              {/* Orders Section */}
              <section className="customers-manager__section">
                <h4 className="customers-manager__section-title flex items-center gap-2">
                  <Package className="h-5 w-5" aria-hidden="true" />
                  {he
                    ? `הזמנות (${selectedCustomer.orders.length})`
                    : `Orders (${selectedCustomer.orders.length})`}
                </h4>
                {selectedCustomer.orders.length === 0 ? (
                  <p className="customers-manager__empty-text">
                    {he ? "אין הזמנות" : "No orders"}
                  </p>
                ) : (
                  <div className="customers-manager__orders-list">
                    {selectedCustomer.orders.map((order) => (
                      <div
                        key={order.id}
                        className="customers-manager__order-item"
                      >
                        <div className="customers-manager__order-main">
                          <code className="customers-manager__order-number">
                            {order.order_number}
                          </code>
                          <span className="customers-manager__order-date">
                            {formatDate(order.created_at)}
                          </span>
                        </div>
                        <div className="customers-manager__order-details">
                          {getOrderStatusBadge(order.status)}
                          <span className="customers-manager__order-total font-mono tabular-nums">
                            {formatCurrency(order.total)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Service Requests Section */}
              <section className="customers-manager__section">
                <h4 className="customers-manager__section-title flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" aria-hidden="true" />
                  {he
                    ? `פניות שירות (${selectedCustomer.serviceRequests.length})`
                    : `Service Requests (${selectedCustomer.serviceRequests.length})`}
                </h4>
                {selectedCustomer.serviceRequests.length === 0 ? (
                  <p className="customers-manager__empty-text">
                    {he ? "אין פניות שירות" : "No service requests"}
                  </p>
                ) : (
                  <div className="customers-manager__requests-list">
                    {selectedCustomer.serviceRequests.map((req) => (
                      <div
                        key={req.id}
                        className="customers-manager__request-item"
                      >
                        <div className="customers-manager__request-main">
                          <span className="customers-manager__request-service">
                            {req.service_id}
                          </span>
                          <span className="customers-manager__request-date">
                            {formatDate(req.created_at)}
                          </span>
                        </div>
                        <div className="customers-manager__request-details">
                          {getRequestStatusBadge(req.status)}
                          <p className="customers-manager__request-message text-sm text-muted-foreground line-clamp-1">
                            {req.message}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Activity Events Section - Split into Product vs Service */}
              <section className="customers-manager__section">
                <h4 className="customers-manager__section-title flex items-center gap-2">
                  <Activity className="h-5 w-5" aria-hidden="true" />
                  {he ? "פעילות אחרונה" : "Recent Activity"}
                </h4>
                {selectedCustomer.events.length === 0 ? (
                  <p className="customers-manager__empty-text">
                    {he ? "אין פעילות מתועדת" : "No recorded activity"}
                  </p>
                ) : (
                  <>
                    {/* Product Activity */}
                    {productEvents.length > 0 && (
                      <div className="customers-manager__activity-group">
                        <h5 className="customers-manager__activity-group-title flex items-center gap-2">
                          <Package
                            className="h-4 w-4 text-primary"
                            aria-hidden="true"
                          />
                          {he ? "פעילות מוצרים" : "Product Activity"}
                          <span className="customers-manager__activity-count">
                            {productEvents.length}
                          </span>
                        </h5>
                        <div className="customers-manager__activity-list">
                          {productEvents.slice(0, 20).map((event, idx) => (
                            <div
                              key={idx}
                              className="customers-manager__activity-item"
                            >
                              <span className="customers-manager__activity-type">
                                {getEventLabel(event.event_type, he)}
                              </span>
                              {event.product_id && (
                                <span className="customers-manager__activity-product font-mono text-xs text-muted-foreground">
                                  Product: {event.product_id.slice(0, 8)}…
                                </span>
                              )}
                              <time
                                className="customers-manager__activity-time"
                                dateTime={event.created_at}
                              >
                                {formatDate(event.created_at)}
                              </time>
                            </div>
                          ))}
                          {productEvents.length > 20 && (
                            <p className="customers-manager__activity-more text-sm text-muted-foreground">
                              {he
                                ? `ועוד ${productEvents.length - 20} אירועים…`
                                : `And ${productEvents.length - 20} more…`}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Search Activity */}
                    {searchEvents.length > 0 && (
                      <div className="customers-manager__activity-group">
                        <h5 className="customers-manager__activity-group-title flex items-center gap-2">
                          <Search
                            className="h-4 w-4 text-secondary-accent"
                            aria-hidden="true"
                          />
                          {he ? "פעילות חיפוש" : "Search Activity"}
                          <span className="customers-manager__activity-count">
                            {searchEvents.length}
                          </span>
                        </h5>
                        <div className="customers-manager__activity-list">
                          {searchEvents.slice(0, 20).map((event, idx) => (
                            <div
                              key={idx}
                              className="customers-manager__activity-item"
                            >
                              <span className="customers-manager__activity-type">
                                {getEventLabel(event.event_type, he)}
                              </span>
                              {event.search_query && (
                                <span className="customers-manager__activity-query text-sm">
                                  {'"'}
                                  {event.search_query}
                                  {'"'}
                                </span>
                              )}
                              <time
                                className="customers-manager__activity-time"
                                dateTime={event.created_at}
                              >
                                {formatDate(event.created_at)}
                              </time>
                            </div>
                          ))}
                          {searchEvents.length > 20 && (
                            <p className="customers-manager__activity-more text-sm text-muted-foreground">
                              {he
                                ? `ועוד ${searchEvents.length - 20} אירועים…`
                                : `And ${searchEvents.length - 20} more…`}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function getEventLabel(eventType: string, he: boolean): string {
  const labels: Record<string, { he: string; en: string }> = {
    product_view: { he: "צפייה במוצר", en: "Product view" },
    product_impression: { he: "הופעת מוצר", en: "Product impression" },
    product_contact_click: { he: "לחיצה על יצירת קשר", en: "Contact click" },
    product_phone_click: { he: "לחיצה על טלפון", en: "Phone click" },
    product_whatsapp_click: { he: "לחיצה על וואטסאפ", en: "WhatsApp click" },
    product_inquiry: { he: "פנייה על מוצר", en: "Product inquiry" },
    product_search: { he: "חיפוש מוצרים", en: "Product search" },
    search_no_result: { he: "חיפוש ללא תוצאות", en: "No-result search" },
  };
  const label = labels[eventType] ?? { he: eventType, en: eventType };
  return he ? label.he : label.en;
}
