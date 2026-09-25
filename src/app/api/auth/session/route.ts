import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";

export async function GET() {
  const actor = await getAuthContext();
  if (!actor || actor.status !== "active") {
    return NextResponse.json(
      { authenticated: false, role: null, name: null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const displayName = actor.profile?.full_name ?? actor.user.email ?? "User";
  return NextResponse.json(
    {
      authenticated: true,
      role: actor.role,
      name: displayName,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
