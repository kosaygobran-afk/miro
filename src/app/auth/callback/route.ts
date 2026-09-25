import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authRequestUrl } from "@/lib/password-recovery";

export async function GET(request: Request) {
  const url = authRequestUrl(request);
  const code = url.searchParams.get("code");
  const candidate = url.searchParams.get("next") ?? "/he/account";
  const next = /^\/(he|en)\/(account|reset-password)$/.test(candidate)
    ? candidate
    : "/he/account";
  const locale = next.startsWith("/en/") ? "en" : "he";
  const recovery = next.endsWith("/reset-password");
  const errorPath = recovery
    ? `/${locale}/reset-password?error=invalid_token`
    : `/${locale}/login?error=auth_callback`;
  if (!code)
    return NextResponse.redirect(
      // Preserve legacy implicit-flow hashes through the HTTP redirect.
      new URL(
        recovery && !url.searchParams.has("error") ? next : errorPath,
        url,
      ),
    );

  if (code) {
    const supabase = await createServerSupabaseClient();
    const flowId = url.searchParams.get("sb_flow_id");
    const { data, error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (error) {
      return NextResponse.redirect(new URL(errorPath, url));
    }
    if ("redirectType" in data && data.redirectType === "recovery") {
      return NextResponse.redirect(new URL(`/${locale}/reset-password`, url));
    }
  }

  return NextResponse.redirect(new URL(next, url));
}
