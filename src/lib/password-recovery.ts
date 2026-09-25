import type { Locale } from "@/lib/i18n";

// Next's request URL can use the internal server hostname. Keep the browser's
// Host so redirects and PKCE/session cookies stay on the same origin.
export function authRequestUrl(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host) url.host = host;
  return url;
}

export function passwordRecoveryRedirect(origin: string, locale: Locale) {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", `/${locale}/reset-password`);
  return url.toString();
}
