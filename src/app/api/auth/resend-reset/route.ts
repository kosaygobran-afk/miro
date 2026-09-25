import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSameOrigin } from "@/lib/request-origin";
import {
  authRequestUrl,
  passwordRecoveryRedirect,
} from "@/lib/password-recovery";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = authRequestUrl(request);
  const email = url.searchParams.get("email");
  const locale = url.searchParams.get("locale") === "en" ? "en" : "he";

  if (!email || !z.string().email().max(254).safeParse(email).success) {
    const errorMessage =
      locale === "he"
        ? "\u05D7\u05E1\u05E8 \u05D3\u05D5\u05D0\u05DC"
        : "Email is required";
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: passwordRecoveryRedirect(url.origin, locale),
  });

  if (error) {
    console.error("Password resend failed:", error.message);
    const errorMessage =
      locale === "he"
        ? "\u05E9\u05DC\u05D9\u05D7\u05EA \u05D4\u05E7\u05D9\u05E9\u05D5\u05E8 \u05E0\u05DB\u05E9\u05DC\u05D4. \u05E0\u05E1\u05D5 \u05E9\u05D5\u05D1."
        : "Could not send the reset link. Try again.";
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
