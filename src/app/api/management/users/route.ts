import { hasSameOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { z } from "zod";

const roles = ["customer", "worker", "admin"] as const;
const statuses = ["active", "suspended", "blocked"] as const;

export async function GET() {
  const actor = await getAuthContext();
  if (
    !actor ||
    actor.status !== "active" ||
    !["ceo", "admin"].includes(actor.role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = await createServerSupabaseClient();
  const [
    { data: profiles, error: profilesError },
    { data: roleRows, error: rolesError },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, phone, account_status, created_at")
      .order("created_at", { ascending: false }),
    admin.from("user_roles").select("user_id, role"),
  ]);

  if (profilesError || rolesError) {
    return NextResponse.json(
      { error: profilesError?.message ?? rolesError?.message },
      { status: 500 },
    );
  }

  const roleByUser = new Map(
    (roleRows ?? []).map((row) => [row.user_id, row.role]),
  );
  return NextResponse.json({
    users: (profiles ?? []).map((profile) => ({
      ...profile,
      role: roleByUser.get(profile.id) ?? "customer",
    })),
  });
}

export async function PATCH(request: Request) {
  const actor = await getAuthContext();
  if (
    !actor ||
    actor.status !== "active" ||
    !["ceo", "admin"].includes(actor.role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = z
    .object({
      userId: z.string().uuid(),
      role: z.enum(roles).optional(),
      status: z.enum(statuses).optional(),
    })
    .strict()
    .refine((value) => value.role || value.status)
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const client = await createServerSupabaseClient();
  const { error } = await client.rpc("manage_account", {
    target: parsed.data.userId,
    new_role: parsed.data.role ?? null,
    new_status: parsed.data.status ?? null,
  });
  if (error)
    return NextResponse.json(
      { error: "Account update was not permitted or could not be saved." },
      { status: error.code === "42501" ? 403 : 400 },
    );
  return NextResponse.json({ ok: true });
}
