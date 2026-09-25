import { createServerClient } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { authRequestUrl } from "@/lib/password-recovery";

const intlMiddleware = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/design-system" || pathname === "/catalog-preview") {
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
    await supabase.auth.getUser();
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
