import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth";
import { isSupabaseUnavailable } from "@/lib/supabase/fetch";
import { createFastServerSupabaseClient } from "@/lib/supabase/server";

const noStore = { "Cache-Control": "private, no-store" };

function unauthenticated() {
  return NextResponse.json(
    { authenticated: false, role: null, name: null },
    { headers: noStore },
  );
}

export async function GET() {
  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore
    .getAll()
    .some(({ name }) => name.startsWith("sb-"));

  // Anonymous visitors and an open circuit never need a remote verification.
  if (!hasAuthCookie || isSupabaseUnavailable()) return unauthenticated();

  try {
    const actor = await getAuthContext(await createFastServerSupabaseClient());
    if (!actor || actor.status !== "active") return unauthenticated();

    const displayName = actor.profile?.full_name ?? actor.user.email ?? "User";
    return NextResponse.json(
      {
        authenticated: true,
        role: actor.role,
        name: displayName,
      },
      { headers: noStore },
    );
  } catch {
    // Session personalization must fail closed and fast, not delay the page.
    return unauthenticated();
  }
}
