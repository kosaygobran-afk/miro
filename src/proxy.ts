import { createServerClient } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { authRequestUrl } from "@/lib/password-recovery";
import { supabaseFetchFast } from "@/lib/supabase/fetch";
import { contentSecurityPolicy } from "@/lib/security-policy";

const intlMiddleware = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/design-system") {
    return NextResponse.next();
  }

  // Auth callbacks must reach their route handler without a locale rewrite.
  if (pathname.startsWith("/auth/")) return NextResponse.next();

  // Supabase falls back to Site URL when a redirect is missing/not allowlisted.
  // Process the code before rendering a homepage or refreshing the old session.
  if (
    /^\/(he|en)?\/?$/.test(pathname) &&
    request.nextUrl.searchParams.has("code")
  ) {
    const callback = authRequestUrl(request);
    callback.pathname = "/auth/callback";
    const locale =
      pathname.startsWith("/en") ||
      (pathname === "/" && request.cookies.get("NEXT_LOCALE")?.value === "en")
        ? "en"
        : "he";
    callback.searchParams.set("next", `/${locale}/account`);
    return NextResponse.redirect(callback);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(
    nonce,
    process.env.NODE_ENV !== "production",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);
  let response = intlMiddleware(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (
    url &&
    key &&
    request.cookies.getAll().some(({ name }) => name.startsWith("sb-"))
  ) {
    const supabase = createServerClient(url, key, {
      global: { fetch: supabaseFetchFast },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookies) {
          cookies.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = intlMiddleware(request);
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
    // Refresh an expiring session and verify its signature using cached JWKS.
    // getClaims falls back to a remote user check for symmetric signing keys.
    // Protected data still performs a fresh getUser + database role/status
    // check in the DAL; proxy claims are never trusted for authorization.
    try {
      await supabase.auth.getClaims();
    } catch {
      // An auth-refresh outage must not break public navigation. Protected data
      // still verifies the session in the data layer before authorizing.
    }
    response.headers.set("Cache-Control", "private, no-store");
  }
  // Preserve next-intl's locale override and refreshed cookies while forwarding
  // the nonce to Server Components and Next's framework scripts.
  const overrides = new Set(
    (response.headers.get("x-middleware-override-headers") ?? "")
      .split(",")
      .filter(Boolean),
  );
  for (const [name, value] of [
    ["x-nonce", nonce],
    ["content-security-policy", csp],
  ]) {
    overrides.add(name);
    response.headers.set(`x-middleware-request-${name}`, value);
  }
  response.headers.set(
    "x-middleware-override-headers",
    [...overrides].join(","),
  );
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
