import { hasSameOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("profile"),
    full_name: z.string().trim().min(1).max(100),
    phone: z.string().trim().max(30),
  }),
  z.object({
    action: z.literal("request"),
    message: z.string().trim().min(10).max(4000),
  }),
  z.object({
    action: z.literal("updateRequest"),
    id: z.string().uuid(),
    status: z.enum(["new", "in_progress", "closed", "spam"]),
    worker: z.string().uuid().nullable(),
  }),
]);

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actor = await getAuthContext();
  if (!actor || actor.status !== "active")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const client = await createServerSupabaseClient();
  const data = parsed.data;
  const result =
    data.action === "profile"
      ? await client
          .from("profiles")
          .update({ full_name: data.full_name, phone: data.phone || null })
          .eq("id", actor.user.id)
          .select("id")
          .single()
      : data.action === "request"
        ? await client.from("service_requests").insert({
            customer_id: actor.user.id,
            name: actor.profile?.full_name || actor.user.email || "Customer",
            email: actor.user.email || "",
            phone: actor.profile?.phone,
            message: data.message,
          })
        : await client.rpc("update_service_request", {
            target: data.id,
            new_status: data.status,
            worker: data.worker,
          });
  if (result.error)
    return NextResponse.json(
      { error: "Unable to save this change." },
      { status: result.error.code === "42501" ? 403 : 400 },
    );
  return NextResponse.json({ ok: true });
}
