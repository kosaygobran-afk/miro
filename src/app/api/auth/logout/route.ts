import { hasSameOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const locale = url.searchParams.get("locale") === "en" ? "en" : "he";
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    return NextResponse.redirect(
      new URL(`/${locale}/account?error=logout`, url),
      303,
    );
  }
  return NextResponse.redirect(new URL(`/${locale}/login`, url), 303);
}
