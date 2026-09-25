import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authRequestUrl } from "@/lib/password-recovery";

export async function GET(request: Request) {
  const url = authRequestUrl(request);
  const token =
    url.searchParams.get("token_hash") ?? url.searchParams.get("token");
  const type = url.searchParams.get("type");
  const locale = url.searchParams.get("locale") === "en" ? "en" : "he";

  // Handle Supabase default recovery flow
  // Link format: /auth/v1/verify?token=xxx&type=recovery
  if (type === "recovery" && token) {
    const supabase = await createServerSupabaseClient();

    // Exchange the token for a session
    const { error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: "recovery",
    });

    if (error) {
      // If token is invalid/expired, redirect to forgot-password with error
      return NextResponse.redirect(
        new URL(`/${locale}/reset-password?error=invalid_token`, url),
        303,
      );
    }

    // Success - redirect to reset-password page
    // The session is now established, so the reset-password page can use updateUser
    return NextResponse.redirect(
      new URL(`/${locale}/reset-password`, url),
      303,
    );
  }

  // Handle other verification types (signup, etc.) - redirect to appropriate page
  if (type === "signup" && token) {
    return NextResponse.redirect(
      new URL(`/${locale}/login?verified=true`, url),
      303,
    );
  }

  // Default fallback
  return NextResponse.redirect(new URL(`/${locale}/login`, url), 303);
}
