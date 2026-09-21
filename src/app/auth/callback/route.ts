import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const candidate = url.searchParams.get("next") ?? "/he/account";
  const next = /^\/(he|en)\/(account|reset-password)$/.test(candidate)
    ? candidate
    : "/he/account";
  const locale = next.startsWith("/en/") ? "en" : "he";
  if (!code)
    return NextResponse.redirect(
      new URL(`/${locale}/login?error=auth_callback`, url),
    );

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/${locale}/login?error=auth_callback`, url),
      );
    }
  }

  return NextResponse.redirect(new URL(next, url));
}
