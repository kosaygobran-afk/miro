import type { AppRole } from "@/lib/roles";

export type AccountSession = {
  authenticated: boolean;
  role: AppRole | null;
  name: string | null;
};

export const ACCOUNT_SESSION_REFRESH_EVENT = "miro:account-session-refresh";
export const ANONYMOUS_ACCOUNT_SESSION: AccountSession = {
  authenticated: false,
  role: null,
  name: null,
};

const pending = new Map<
  string,
  { controller: AbortController; promise: Promise<AccountSession> }
>();

/** Share only overlapping browser reads. Never retain a settled identity. */
export function readAccountSession(scope: string): Promise<AccountSession> {
  const existing = pending.get(scope);
  if (existing) return existing.promise;

  const controller = new AbortController();
  const promise = Promise.resolve().then(async (): Promise<AccountSession> => {
    try {
      const response = await fetch("/api/auth/session", {
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10_000),
        ]),
      });
      if (!response.ok) return ANONYMOUS_ACCOUNT_SESSION;
      const data = await response.json();
      if (
        controller.signal.aborted ||
        data?.authenticated !== true ||
        !["ceo", "admin", "worker", "customer"].includes(data.role)
      )
        return ANONYMOUS_ACCOUNT_SESSION;
      return {
        authenticated: true,
        role: data.role,
        name: typeof data.name === "string" ? data.name : null,
      };
    } catch {
      return ANONYMOUS_ACCOUNT_SESSION;
    } finally {
      if (pending.get(scope)?.controller === controller) pending.delete(scope);
    }
  });
  pending.set(scope, { controller, promise });
  return promise;
}

/** Discard pre-logout reads and refresh every mounted menu after auth changes. */
export function invalidateAccountSession() {
  for (const { controller } of pending.values()) controller.abort();
  pending.clear();
  window.dispatchEvent(new Event(ACCOUNT_SESSION_REFRESH_EVENT));
}
