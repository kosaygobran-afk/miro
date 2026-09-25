import { hasSameOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { getAuthContext, isCeo } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
} from "@/app/api/management/_shared";

const roles = ["customer", "worker", "admin"] as const;
const statuses = ["active", "suspended", "blocked"] as const;

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewUsers");
  if (!auth.ok) return auth.response;

  const client = await createServerSupabaseClient();
  const admin = createAdminClient();
  const [
    { data: profiles, error: profilesError },
    { data: roleRows, error: rolesError },
    { data: authUsers, error: authError },
  ] = await Promise.all([
    client
      .from("profiles")
      .select("id, full_name, phone, account_status, created_at")
      .order("created_at", { ascending: false }),
    client.from("user_roles").select("user_id, role"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  if (profilesError || rolesError || authError) {
    return errorResponse(
      profilesError?.message ??
        rolesError?.message ??
        authError?.message ??
        "Database error",
    );
  }

  const roleByUser = new Map(
    (roleRows ?? []).map((row) => [row.user_id, row.role]),
  );
  const emailByUser = new Map(
    (authUsers?.users ?? []).map((user) => [user.id, user.email ?? ""]),
  );
  return NextResponse.json({
    users: (profiles ?? []).map((profile) => ({
      ...profile,
      email: emailByUser.get(profile.id) ?? "",
      role: roleByUser.get(profile.id) ?? "customer",
    })),
  });
}

export async function PATCH(request: Request) {
  const actor = await getAuthContext();
  if (!actor || actor.status !== "active" || !isCeo(actor.role)) {
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

  await createAdminClient()
    .from("audit_events")
    .insert({
      action: "user_updated",
      user_id: actor.user.id,
      details: {
        target_user_id: parsed.data.userId,
        role: parsed.data.role,
        status: parsed.data.status,
      },
      entity_type: "user",
      entity_id: parsed.data.userId,
    });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const actor = await getAuthContext();
  if (!actor || actor.status !== "active" || !isCeo(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = z
    .object({ userId: z.string().uuid() })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const client = await createServerSupabaseClient();
  const { error: rpcError } = await client.rpc("delete_user_account", {
    target: parsed.data.userId,
  });
  if (rpcError)
    return NextResponse.json(
      {
        error: "Account deletion was not permitted or could not be completed.",
      },
      { status: rpcError.code === "42501" ? 403 : 400 },
    );

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.deleteUser(
    parsed.data.userId,
  );
  if (authError)
    return NextResponse.json(
      { error: "Auth user cleanup failed." },
      { status: 500 },
    );

  await admin.from("audit_events").insert({
    action: "user_deleted",
    user_id: actor.user.id,
    details: { target_user_id: parsed.data.userId },
    entity_type: "user",
    entity_id: parsed.data.userId,
  });

  return NextResponse.json({ ok: true });
}
