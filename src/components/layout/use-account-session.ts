"use client";

import { useEffect, useState } from "react";
import {
  ACCOUNT_SESSION_REFRESH_EVENT,
  readAccountSession,
  type AccountSession,
} from "@/lib/account-session";

export function useAccountSession(pathname: string) {
  const [session, setSession] = useState<AccountSession | null>(null);

  useEffect(() => {
    let active = true;
    let latestRead = 0;
    const refresh = async () => {
      const read = ++latestRead;
      const data = await readAccountSession(pathname);
      if (active && read === latestRead) setSession(data);
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(ACCOUNT_SESSION_REFRESH_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener(ACCOUNT_SESSION_REFRESH_EVENT, refresh);
    };
  }, [pathname]);

  return [session, setSession] as const;
}
