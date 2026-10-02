"use client";

import { TableSkeleton } from "./ui/skeleton";
import { Pager } from "./pager";
import { useCollectionPage } from "./use-collection-page";

import { useState, useCallback } from "react";
import {
  AlertCircle,
  Trash2,
  RotateCcw,
  Eye,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { PageHeader } from "./ui/page-header";
import { Toolbar } from "./ui/toolbar";
import { CollectionSummary } from "./ui/collection-summary";
import { OverflowText } from "./ui/overflow-text";
import { ScrollRegion } from "./ui/scroll-region";
import { roleLabel, type AppRole } from "@/lib/roles";

type ManagedUser = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  account_status: "active" | "suspended" | "blocked";
  role: AppRole;
  created_at: string;
};

type UserActionState = {
  type: "delete";
  userId: string;
  confirmText: string;
} | null;

function getRoleBadgeClass(role: AppRole): string {
  switch (role) {
    case "ceo":
      return "role-badge role-badge--ceo";
    case "admin":
      return "role-badge role-badge--admin";
    case "worker":
      return "role-badge role-badge--worker";
    case "customer":
      return "role-badge role-badge--customer";
    default:
      return "role-badge";
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "status-badge status-badge--active";
    case "suspended":
      return "status-badge status-badge--suspended";
    case "blocked":
      return "status-badge status-badge--blocked";
    default:
      return "status-badge";
  }
}

export function UsersManagement({
  locale,
  canControlAdmins,
  initialUsers,
  initialError = "",
}: {
  locale: "he" | "en";
  canControlAdmins: boolean;
  initialUsers: ManagedUser[];
  initialError?: string;
}) {
  const he = locale === "he";
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  function usersForFilter() {
    return users.filter(
      (user) =>
        (roleFilter === "all" || user.role === roleFilter) &&
        (statusFilter === "all" || user.account_status === statusFilter) &&
        [user.full_name, user.email, user.phone].some((value) =>
          value?.toLowerCase().includes(query.trim().toLowerCase()),
        ),
    );
  }
  const [users, setUsers] = useState<ManagedUser[]>(initialUsers);
  const filteredUsers = usersForFilter();
  const { visibleItems: visibleUsers, pager } = useCollectionPage(
    filteredUsers,
    `${query}:${roleFilter}:${statusFilter}`,
  );
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [actionState, setActionState] = useState<UserActionState>(null);
  const [pendingChange, setPendingChange] = useState<{
    userId: string;
    field: "role" | "status";
    value: string;
  } | null>(null);

  const loadUsers = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/management/users", {
          cache: "no-store",
        });
        const data = await response.json();
        if (response.ok) {
          setUsers(data.users);
          setError("");
        } else {
          setError(
            data.error ||
              (he ? "לא ניתן לטעון משתמשים" : "Unable to load users"),
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

  const showMessage = (text: string, type: "success" | "error" = "success") => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(""), 5000);
  };

  const clearActionState = () => setActionState(null);

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    setBusy(true);
    try {
      const response = await fetch("/api/management/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      const data = await response.json();
      if (response.ok) {
        showMessage(he ? "התפקיד עודכן" : "Role updated");
        await loadUsers();
      } else {
        showMessage(
          data.error || (he ? "עדכון נכשל" : "Update failed"),
          "error",
        );
      }
    } catch {
      showMessage(he ? "שגיאת חיבור" : "Connection error", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (
    userId: string,
    newStatus: "active" | "suspended" | "blocked",
  ) => {
    setBusy(true);
    try {
      const response = await fetch("/api/management/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, status: newStatus }),
      });
      const data = await response.json();
      if (response.ok) {
        showMessage(
          newStatus === "active"
            ? he
              ? "החשבון הופעל"
              : "Account activated"
            : he
              ? "החשבון הושהה"
              : "Account suspended",
        );
        await loadUsers();
      } else {
        showMessage(
          data.error || (he ? "עדכון נכשל" : "Update failed"),
          "error",
        );
      }
    } catch {
      showMessage(he ? "שגיאת חיבור" : "Connection error", "error");
    } finally {
      setBusy(false);
    }
  };

  const requestPendingChange = (
    userId: string,
    field: "role" | "status",
    value: string,
    currentValue: string,
  ) => {
    if (value === currentValue) {
      if (pendingChange?.userId === userId && pendingChange.field === field) {
        setPendingChange(null);
      }
      return;
    }
    setPendingChange({ userId, field, value });
  };

  const confirmPendingChange = async () => {
    if (!pendingChange) return;
    const { userId, field, value } = pendingChange;
    setPendingChange(null);
    if (field === "role") {
      await handleRoleChange(userId, value as AppRole);
    } else {
      await handleStatusChange(
        userId,
        value as "active" | "suspended" | "blocked",
      );
    }
  };

  const pendingChangeFor = (userId: string, field: "role" | "status") =>
    pendingChange?.userId === userId && pendingChange.field === field
      ? pendingChange.value
      : undefined;

  const handleDeleteUser = async (userId: string) => {
    if (actionState?.confirmText?.trim().toUpperCase() !== "DELETE") {
      showMessage(
        he ? "הקלידו DELETE לאישור" : "Type DELETE to confirm",
        "error",
      );
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/management/users", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await response.json();
      if (response.ok) {
        showMessage(he ? "המשתמש נמחק" : "User deleted");
        await loadUsers();
        clearActionState();
      } else {
        showMessage(
          data.error || (he ? "מחיקה נכשלה" : "Delete failed"),
          "error",
        );
      }
    } catch {
      showMessage(he ? "שגיאת חיבור" : "Connection error", "error");
    } finally {
      setBusy(false);
    }
  };

  const startDeleteConfirm = (userId: string) => {
    setActionState({ type: "delete", userId, confirmText: "" });
  };

  const updateConfirmText = (userId: string, text: string) => {
    setActionState({ type: "delete", userId, confirmText: text });
  };

  const getRoleOptions = (currentRole: AppRole): AppRole[] => {
    const allRoles: AppRole[] = ["customer", "worker", "admin", "ceo"];
    return allRoles.filter(
      (r) =>
        r === currentRole ||
        (r !== "ceo" && (r !== "admin" || canControlAdmins)),
    );
  };

  const getStatusOptions = () => ["active", "suspended", "blocked"] as const;

  const isCeoAccount = (user: ManagedUser) => user.role === "ceo";

  const adminOnly = !canControlAdmins;

  if (loading) {
    return (
      <TableSkeleton
        columnWidths={["18%", "23%", "10%", "12%", "37%"]}
        minWidth="74rem"
        columns={
          he
            ? ["משתמש", "פרטי קשר", "תפקיד", "סטטוס", "פעולות"]
            : ["User", "Contact details", "Role", "Status", "Actions"]
        }
        leadingImage={false}
        label={he ? "טוען נתונים…" : "Loading data…"}
      />
    );
  }

  if (error && users.length === 0) {
    return (
      <div className="users-management__error" role="alert">
        <AlertCircle
          className="users-management__error-icon h-5 w-5"
          aria-hidden="true"
        />
        <div className="users-management__error-content">
          <p className="users-management__error-title">
            {he ? "שגיאה בטעינת המשתמשים" : "Failed to load users"}
          </p>
          <p className="users-management__error-message">{error}</p>
          <button
            className="miro-button miro-button-secondary users-management__retry-button"
            onClick={() => loadUsers(true)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {he ? "נסה שוב" : "Retry"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="users-management space-y-6">
      <PageHeader
        title={he ? "אנשים והרשאות" : "People and permissions"}
        subtitle={
          he
            ? "צפייה בחשבונות ובתפקידים, עם שליטה ברורה בהתאם להרשאות שלך."
            : "A clear view of accounts and roles, with controls that respect your permissions."
        }
        actions={
          <button
            type="button"
            className="mgmt-button mgmt-button--secondary"
            disabled={busy}
            onClick={() => loadUsers(true)}
          >
            <RotateCcw size={17} aria-hidden="true" />
            {he ? "רענון" : "Refresh"}
          </button>
        }
      />
      <CollectionSummary
        items={[
          {
            label: he ? "חשבונות שנטענו" : "Loaded accounts",
            value: users.length,
          },
          {
            label: he ? "פעילים" : "Active",
            value: users.filter((user) => user.account_status === "active")
              .length,
          },
          {
            label: he ? "צוות ניהול" : "Management team",
            value: users.filter((user) => ["admin", "ceo"].includes(user.role))
              .length,
          },
          {
            label: he ? "מושהים או חסומים" : "Suspended or blocked",
            value: users.filter((user) => user.account_status !== "active")
              .length,
          },
        ]}
        scope={
          he
            ? "סיכום החשבונות שנטענו לתצוגה."
            : "Summary of accounts loaded into this view."
        }
      />
      <Toolbar
        searchValue={query}
        onSearchChange={setQuery}
        searchLabel={he ? "חיפוש חשבונות" : "Search accounts"}
        searchPlaceholder={
          he ? "שם, אימייל או טלפון…" : "Name, email or phone…"
        }
      >
        <label className="mgmt-filter-field">
          {he ? "תפקיד" : "Role"}
          <select
            className="mgmt-select"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="all">{he ? "כל התפקידים" : "All roles"}</option>
            {(["customer", "worker", "admin", "ceo"] as const).map((role) => (
              <option key={role} value={role}>
                {roleLabel(role, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="mgmt-filter-field">
          {he ? "מצב" : "Status"}
          <select
            className="mgmt-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">{he ? "כל המצבים" : "All statuses"}</option>
            <option value="active">{he ? "פעיל" : "Active"}</option>
            <option value="suspended">{he ? "מושהה" : "Suspended"}</option>
            <option value="blocked">{he ? "חסום" : "Blocked"}</option>
          </select>
        </label>
      </Toolbar>
      <div className="miro-card">
        <div className="border-b border-border-subtle p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">
                {he ? "ספר החשבונות" : "Account directory"}
              </h2>
              <p className="mt-1 text-muted-foreground">
                {he
                  ? "צפייה וניהול חשבונות משתמשים במערכת"
                  : "View and manage user accounts in the system"}
              </p>
            </div>
            {adminOnly && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted-foreground/10 text-muted-foreground">
                <Eye className="h-3 w-3" aria-hidden="true" />
                {he ? "מצב צפייה בלבד" : "View only"}
              </span>
            )}
          </div>
          {message && (
            <p className="mt-3 text-sm" role="status" aria-live="polite">
              <span
                className={`users-management__message ${
                  messageType === "success"
                    ? "users-management__message--success"
                    : "users-management__message--error"
                }`}
              >
                {messageType === "success" ? (
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                )}
                {message}
              </span>
            </p>
          )}
        </div>

        {filteredUsers.length === 0 ? (
          <div className="users-management__empty" role="status">
            {he ? "אין משתמשים במערכת" : "No users in the system"}
          </div>
        ) : (
          <>
            <ScrollRegion
              className="users-management__table-wrapper"
              label={he ? "טבלת ניהול משתמשים" : "User management table"}
            >
              <table className="users-management__table">
                <caption className="sr-only">
                  {he ? "טבלת ניהול משתמשים" : "User management table"}
                </caption>
                <thead className="users-management__thead">
                  <tr>
                    <th className="users-management__th" scope="col">
                      {he ? "שם מלא" : "Full name"}
                    </th>
                    <th className="users-management__th" scope="col">
                      {he ? "אימייל" : "Email"}
                    </th>
                    <th className="users-management__th" scope="col">
                      {he ? "תפקיד" : "Role"}
                    </th>
                    <th className="users-management__th" scope="col">
                      {he ? "מצב חשבון" : "Account status"}
                    </th>
                    <th className="users-management__th" scope="col">
                      {adminOnly
                        ? he
                          ? "פעולות (צפייה בלבד)"
                          : "Actions (view only)"
                        : he
                          ? "פעולות"
                          : "Actions"}
                    </th>
                  </tr>
                </thead>
                <tbody className="motion-content-reveal">
                  {visibleUsers.map((user) => (
                    <tr key={user.id}>
                      <td className="users-management__td">
                        <div className="users-management__user-info">
                          <p className="users-management__user-name">
                            <OverflowText
                              text={
                                user.full_name || (he ? "ללא שם" : "No name")
                              }
                            />
                          </p>
                          <p className="users-management__user-id">
                            {user.id.slice(0, 8)}…
                          </p>
                        </div>
                      </td>
                      <td className="users-management__td">
                        <a
                          href={`mailto:${user.email}`}
                          className="users-management__email"
                        >
                          <OverflowText
                            text={user.email}
                            dir="ltr"
                            focusable={false}
                          />
                        </a>
                      </td>
                      <td className="users-management__td">
                        <span className={getRoleBadgeClass(user.role)}>
                          {roleLabel(user.role, locale)}
                        </span>
                      </td>
                      <td className="users-management__td">
                        <span
                          className={getStatusBadgeClass(user.account_status)}
                        >
                          {user.account_status === "active"
                            ? he
                              ? "פעיל"
                              : "Active"
                            : user.account_status === "suspended"
                              ? he
                                ? "מושהה"
                                : "Suspended"
                              : he
                                ? "חסום"
                                : "Blocked"}
                        </span>
                      </td>
                      <td className="users-management__td">
                        <div className="users-management__actions">
                          {adminOnly ? (
                            <span className="users-management__view-only">
                              {he ? "ללא הרשאות ניהול" : "No admin permissions"}
                            </span>
                          ) : isCeoAccount(user) ? (
                            <span className="users-management__protected">
                              <ShieldCheck
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                              {he
                                ? "חשבון מנכ״ל מוגן"
                                : "Protected CEO account"}
                            </span>
                          ) : (
                            <>
                              <select
                                disabled={busy}
                                value={
                                  pendingChangeFor(user.id, "role") ?? user.role
                                }
                                onChange={(e) =>
                                  requestPendingChange(
                                    user.id,
                                    "role",
                                    e.target.value,
                                    user.role,
                                  )
                                }
                                className="users-management__select"
                                aria-label={he ? "שינוי תפקיד" : "Change role"}
                              >
                                {getRoleOptions(user.role).map((role) => (
                                  <option
                                    key={role}
                                    value={role}
                                    disabled={role === user.role}
                                  >
                                    {roleLabel(role, locale)}
                                  </option>
                                ))}
                              </select>
                              <select
                                disabled={busy}
                                value={
                                  pendingChangeFor(user.id, "status") ??
                                  user.account_status
                                }
                                onChange={(e) =>
                                  requestPendingChange(
                                    user.id,
                                    "status",
                                    e.target.value,
                                    user.account_status,
                                  )
                                }
                                className="users-management__select"
                                aria-label={
                                  he
                                    ? "שינוי מצב חשבון"
                                    : "Change account status"
                                }
                              >
                                {getStatusOptions().map((status) => (
                                  <option
                                    key={status}
                                    value={status}
                                    disabled={status === user.account_status}
                                  >
                                    {status === "active"
                                      ? he
                                        ? "פעיל"
                                        : "Active"
                                      : status === "suspended"
                                        ? he
                                          ? "מושהה"
                                          : "Suspended"
                                        : he
                                          ? "חסום"
                                          : "Blocked"}
                                  </option>
                                ))}
                              </select>
                              {pendingChange?.userId === user.id && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="miro-button miro-button-secondary text-sm"
                                    onClick={confirmPendingChange}
                                  >
                                    {he ? "אישור" : "Confirm"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="miro-button miro-button-secondary text-sm"
                                    onClick={() => setPendingChange(null)}
                                  >
                                    {he ? "ביטול" : "Cancel"}
                                  </button>
                                </div>
                              )}
                              {actionState?.type === "delete" &&
                                actionState.userId === user.id && (
                                  <div className="users-management__delete-confirm">
                                    <input
                                      type="text"
                                      value={actionState.confirmText}
                                      placeholder={
                                        he ? "הקלידו DELETE" : "Type DELETE"
                                      }
                                      onChange={(e) =>
                                        updateConfirmText(
                                          user.id,
                                          e.target.value,
                                        )
                                      }
                                      className="users-management__delete-input miro-input"
                                      autoFocus
                                      aria-label={
                                        he ? "אישור מחיקה" : "Confirm deletion"
                                      }
                                    />
                                    <button
                                      type="button"
                                      disabled={
                                        busy ||
                                        actionState.confirmText
                                          .trim()
                                          .toUpperCase() !== "DELETE"
                                      }
                                      className="miro-button miro-button-secondary text-sm text-destructive"
                                      onClick={() => handleDeleteUser(user.id)}
                                    >
                                      {he ? "מחיקה" : "Delete"}
                                    </button>
                                    <button
                                      type="button"
                                      className="miro-button miro-button-secondary text-sm text-destructive"
                                      onClick={clearActionState}
                                      aria-label={he ? "ביטול" : "Cancel"}
                                    >
                                      <X
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                      />
                                    </button>
                                  </div>
                                )}
                              {!actionState?.userId ||
                              actionState.userId !== user.id ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className="miro-button miro-button-secondary text-sm text-destructive hover:bg-destructive/10"
                                  onClick={() => startDeleteConfirm(user.id)}
                                  aria-label={
                                    he ? "מחיקת משתמש" : "Delete user"
                                  }
                                >
                                  <Trash2
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                  />
                                </button>
                              ) : null}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>

            {/* Mobile Card View */}
            <div className="users-management__card-list" role="list">
              {visibleUsers.map((user) => (
                <div
                  key={user.id}
                  className="users-management__card"
                  role="listitem"
                >
                  <div className="users-management__card-header">
                    <div>
                      <p className="users-management__card-name">
                        <OverflowText
                          text={user.full_name || (he ? "ללא שם" : "No name")}
                        />
                      </p>
                      <p className="users-management__card-id">
                        {user.id.slice(0, 8)}…
                      </p>
                    </div>
                    <span className={getRoleBadgeClass(user.role)}>
                      {roleLabel(user.role, locale)}
                    </span>
                  </div>
                  <div className="users-management__card-body">
                    <div className="users-management__card-field">
                      <span className="users-management__card-label">
                        {he ? "אימייל" : "Email"}
                      </span>
                      <a
                        href={`mailto:${user.email}`}
                        className="users-management__card-email"
                      >
                        <OverflowText
                          text={user.email}
                          dir="ltr"
                          focusable={false}
                        />
                      </a>
                    </div>
                    <div className="users-management__card-field">
                      <span className="users-management__card-label">
                        {he ? "תפקיד" : "Role"}
                      </span>
                      <span className="users-management__card-value">
                        <span className={getRoleBadgeClass(user.role)}>
                          {roleLabel(user.role, locale)}
                        </span>
                      </span>
                    </div>
                    <div className="users-management__card-field">
                      <span className="users-management__card-label">
                        {he ? "מצב" : "Status"}
                      </span>
                      <span className="users-management__card-value">
                        <span
                          className={getStatusBadgeClass(user.account_status)}
                        >
                          {user.account_status === "active"
                            ? he
                              ? "פעיל"
                              : "Active"
                            : user.account_status === "suspended"
                              ? he
                                ? "מושהה"
                                : "Suspended"
                              : he
                                ? "חסום"
                                : "Blocked"}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="users-management__card-actions">
                    {adminOnly ? (
                      <span
                        className="users-management__view-only"
                        style={{ flex: "1 1 100%" }}
                      >
                        {he
                          ? "מצב צפייה בלבד — אין הרשאות ניהול"
                          : "View only — no admin permissions"}
                      </span>
                    ) : isCeoAccount(user) ? (
                      <span
                        className="users-management__protected"
                        style={{ flex: "1 1 100%" }}
                      >
                        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                        {he ? "חשבון מנכ״ל מוגן" : "Protected CEO account"}
                      </span>
                    ) : (
                      <>
                        <select
                          disabled={busy}
                          value={pendingChangeFor(user.id, "role") ?? user.role}
                          onChange={(e) =>
                            requestPendingChange(
                              user.id,
                              "role",
                              e.target.value,
                              user.role,
                            )
                          }
                          className="users-management__select"
                          aria-label={he ? "שינוי תפקיד" : "Change role"}
                        >
                          {getRoleOptions(user.role).map((role) => (
                            <option
                              key={role}
                              value={role}
                              disabled={role === user.role}
                            >
                              {roleLabel(role, locale)}
                            </option>
                          ))}
                        </select>
                        <select
                          disabled={busy}
                          value={
                            pendingChangeFor(user.id, "status") ??
                            user.account_status
                          }
                          onChange={(e) =>
                            requestPendingChange(
                              user.id,
                              "status",
                              e.target.value,
                              user.account_status,
                            )
                          }
                          className="users-management__select"
                          aria-label={
                            he ? "שינוי מצב חשבון" : "Change account status"
                          }
                        >
                          {getStatusOptions().map((status) => (
                            <option
                              key={status}
                              value={status}
                              disabled={status === user.account_status}
                            >
                              {status === "active"
                                ? he
                                  ? "פעיל"
                                  : "Active"
                                : status === "suspended"
                                  ? he
                                    ? "מושהה"
                                    : "Suspended"
                                  : he
                                    ? "חסום"
                                    : "Blocked"}
                            </option>
                          ))}
                        </select>
                        {pendingChange?.userId === user.id && (
                          <div
                            style={{
                              flex: "1 1 100%",
                              display: "flex",
                              gap: "0.5rem",
                            }}
                          >
                            <button
                              type="button"
                              disabled={busy}
                              className="miro-button miro-button-secondary text-sm"
                              onClick={confirmPendingChange}
                            >
                              {he ? "אישור" : "Confirm"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              className="miro-button miro-button-secondary text-sm"
                              onClick={() => setPendingChange(null)}
                            >
                              {he ? "ביטול" : "Cancel"}
                            </button>
                          </div>
                        )}
                        {actionState?.type === "delete" &&
                        actionState.userId === user.id ? (
                          <div
                            className="users-management__delete-confirm"
                            style={{
                              flex: "1 1 100%",
                              display: "flex",
                              gap: "0.5rem",
                            }}
                          >
                            <input
                              type="text"
                              value={actionState.confirmText}
                              placeholder={he ? "הקלידו DELETE" : "Type DELETE"}
                              onChange={(e) =>
                                updateConfirmText(user.id, e.target.value)
                              }
                              className="users-management__delete-input miro-input"
                              autoFocus
                              aria-label={
                                he ? "אישור מחיקה" : "Confirm deletion"
                              }
                            />
                            <button
                              type="button"
                              disabled={
                                busy ||
                                actionState.confirmText.trim().toUpperCase() !==
                                  "DELETE"
                              }
                              className="miro-button miro-button-secondary text-sm text-destructive"
                              onClick={() => handleDeleteUser(user.id)}
                            >
                              {he ? "מחיקה" : "Delete"}
                            </button>
                            <button
                              type="button"
                              className="miro-button miro-button-secondary text-sm text-destructive"
                              onClick={clearActionState}
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
                            onClick={() => startDeleteConfirm(user.id)}
                            aria-label={he ? "מחיקת משתמש" : "Delete user"}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Pager {...pager} locale={locale} busy={loading || busy} />
          </>
        )}
      </div>
    </div>
  );
}
