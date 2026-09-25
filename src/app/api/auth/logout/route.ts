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
  const isFetch = request.headers
    .get("content-type")
    ?.includes("application/json");
  if (error) {
    if (isFetch) {
      return NextResponse.json({ error: "Logout failed" }, { status: 500 });
    }
    return NextResponse.redirect(
      new URL(`/${locale}/account?error=logout`, url),
      303,
    );
  }
  if (isFetch) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.redirect(new URL(`/${locale}/login`, url), 303);
}
