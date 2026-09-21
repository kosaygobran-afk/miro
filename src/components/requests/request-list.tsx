"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Item = {
  id: string;
  name: string;
  message: string;
  status: string;
  assigned_worker_id: string | null;
};
export function RequestList({
  items,
  workers,
  locale,
  manager,
}: {
  items: Item[];
  workers: { id: string; name: string }[];
  locale: "he" | "en";
  manager: boolean;
}) {
  const he = locale === "he";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function update(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateRequest",
          id,
          status: data.get("status"),
          worker: data.get("worker") || null,
        }),
      });
      if (!response.ok) throw new Error();
      setNotice(he ? "עודכן בהצלחה." : "Updated successfully.");
      router.refresh();
    } catch {
      setNotice(he ? "העדכון נכשל." : "Unable to update.");
    } finally {
      setBusy(false);
    }
  }
  const statuses: Record<string, string> = he
    ? { new: "חדש", in_progress: "בטיפול", closed: "סגור", spam: "דואר זבל" }
    : {
        new: "New",
        in_progress: "In progress",
        closed: "Closed",
        spam: "Spam",
      };
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-black">
        {he ? "פניות שירות" : "Service requests"}
      </h2>
      {items.length === 0 && (
        <p>{he ? "אין פניות להצגה." : "No requests to display."}</p>
      )}
      {items.map((item) => (
        <form
          key={item.id}
          onSubmit={(event) => update(event, item.id)}
          className="miro-card space-y-3 p-6"
        >
          <h3 className="font-bold">{item.name}</h3>
          <p className="whitespace-pre-wrap break-words">{item.message}</p>
          <label className="block">
            {he ? "מצב" : "Status"}
            <select
              name="status"
              className="miro-input"
              defaultValue={
                manager
                  ? item.status
                  : item.status === "closed"
                    ? "closed"
                    : "in_progress"
              }
            >
              {(manager
                ? Object.keys(statuses)
                : ["in_progress", "closed"]
              ).map((status) => (
                <option key={status} value={status}>
                  {statuses[status]}
                </option>
              ))}
            </select>
          </label>
          {manager && (
            <label className="block">
              {he ? "עובד אחראי" : "Assigned worker"}
              <select
                name="worker"
                className="miro-input"
                defaultValue={item.assigned_worker_id ?? ""}
              >
                <option value="">{he ? "ללא שיוך" : "Unassigned"}</option>
                {workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="miro-button miro-button-primary" disabled={busy}>
            {he ? "שמירת עדכון" : "Save update"}
          </button>
        </form>
      ))}
      <p role="status">{notice}</p>
    </section>
  );
}
