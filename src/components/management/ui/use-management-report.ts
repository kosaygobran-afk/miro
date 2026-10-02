"use client";

import { useEffect, useState } from "react";

/** One abortable request owns each range/refresh; older responses cannot overwrite it. */
export function useManagementReport<T>(url: string, errorLabel: string) {
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data: T | null;
    error: string;
  }>({ key: "", data: null, error: "" });
  const key = `${url}:${reloadKey}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || !json?.totals)
          throw new Error(
            typeof json?.error === "string" ? json.error : errorLabel,
          );
        if (!controller.signal.aborted)
          setResult({ key, data: json as T, error: "" });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult((previous) => ({
            key,
            data: previous.data,
            error: error instanceof Error ? error.message : errorLabel,
          }));
      });
    return () => controller.abort();
  }, [url, key, errorLabel]);
  return {
    data: result.data,
    error: result.error,
    loading: result.key !== key,
    reload: () => setReloadKey((value) => value + 1),
  };
}
