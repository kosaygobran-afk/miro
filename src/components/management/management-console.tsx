"use client";

import { useState } from "react";

type ManagedUser = {
  id: string;
  full_name: string | null;
  phone: string | null;
  account_status: string;
  role: string;
  created_at: string;
};

export function ManagementConsole({
  locale,
  canControlAdmins,
  initialUsers,
}: {
  locale: "he" | "en";
  canControlAdmins: boolean;
  initialUsers: ManagedUser[];
}) {
  const he = locale === "he";
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<ManagedUser[]>(initialUsers);
  const [message, setMessage] = useState("");

  async function loadUsers() {
    const response = await fetch("/api/management/users", {
      cache: "no-store",
    });
    const data = await response.json();
    if (response.ok) setUsers(data.users);
    else setMessage(data.error || "Unable to load users.");
  }

  async function updateUser(
    userId: string,
    patch: { role?: string; status?: string },
  ) {
    setBusy(true);
    try {
      const response = await fetch("/api/management/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, ...patch }),
      });
      const data = await response.json();
      setMessage(
        response.ok
          ? locale === "he"
            ? "עודכן בהצלחה."
            : "Updated successfully."
          : data.error,
      );
      if (response.ok) await loadUsers();
    } catch {
      setMessage(he ? "העדכון נכשל." : "Unable to update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="miro-card overflow-hidden">
      <div className="border-b border-border-subtle p-6">
        <h2 className="text-2xl font-black">
          {locale === "he" ? "ניהול חשבונות" : "Account management"}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {locale === "he"
            ? "המרת לקוחות לעובדים וניהול הרשאות."
            : "Convert customers to workers and manage permissions."}
        </p>
        {message && (
          <p className="mt-3 text-sm text-accent-text" role="status">
            {message}
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left">
              <th className="p-4">{he ? "שם" : "Name"}</th>
              <th className="p-4">{he ? "תפקיד" : "Role"}</th>
              <th className="p-4">{he ? "מצב" : "Status"}</th>
              <th className="p-4">{he ? "פעולות" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-border-subtle">
                <td className="p-4">{user.full_name || user.id}</td>
                <td className="p-4">{user.role}</td>
                <td className="p-4">{user.account_status}</td>
                <td className="flex flex-wrap gap-2 p-4">
                  {user.role === "customer" && (
                    <button
                      disabled={busy}
                      className="miro-button miro-button-secondary text-xs"
                      onClick={() => updateUser(user.id, { role: "worker" })}
                    >
                      {he ? "הפיכה לעובד" : "Make worker"}
                    </button>
                  )}
                  {user.role === "worker" && (
                    <button
                      disabled={busy}
                      className="miro-button miro-button-secondary text-xs"
                      onClick={() => updateUser(user.id, { role: "customer" })}
                    >
                      {he ? "הפיכה ללקוח" : "Make customer"}
                    </button>
                  )}
                  {canControlAdmins &&
                    user.role !== "admin" &&
                    user.role !== "ceo" && (
                      <button
                        disabled={busy}
                        className="miro-button miro-button-secondary text-xs"
                        onClick={() => updateUser(user.id, { role: "admin" })}
                      >
                        {he ? "הפיכה למנהל" : "Make admin"}
                      </button>
                    )}
                  {canControlAdmins &&
                    user.role !== "ceo" &&
                    user.account_status !== "active" && (
                      <button
                        disabled={busy}
                        className="miro-button miro-button-secondary text-xs"
                        onClick={() =>
                          updateUser(user.id, { status: "active" })
                        }
                      >
                        {he ? "הפעלה" : "Activate"}
                      </button>
                    )}
                  {canControlAdmins &&
                    user.role !== "ceo" &&
                    user.account_status === "active" && (
                      <button
                        disabled={busy}
                        className="miro-button miro-button-secondary text-xs"
                        onClick={() =>
                          updateUser(user.id, { status: "suspended" })
                        }
                      >
                        {he ? "השהיה" : "Suspend"}
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
