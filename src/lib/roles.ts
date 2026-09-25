export type AppRole = "customer" | "worker" | "admin" | "ceo";
export type AccountStatus = "active" | "suspended" | "blocked";

export function roleHome(role: AppRole) {
  if (role === "customer") return "account";
  if (role === "worker") return "worker";
  return "admin";
}

export function roleLabel(role: AppRole, locale: "he" | "en") {
  return locale === "he"
    ? { ceo: "מנכ״ל", admin: "מנהל", worker: "עובד", customer: "לקוח" }[role]
    : { ceo: "CEO", admin: "Admin", worker: "Worker", customer: "Customer" }[
        role
      ];
}

export function canEditAccount(
  actor: AppRole,
  actorId: string,
  target: { id: string; role: string },
) {
  return (
    actorId !== target.id &&
    target.role !== "ceo" &&
    (actor === "ceo" ||
      (actor === "admin" && ["customer", "worker"].includes(target.role)))
  );
}
