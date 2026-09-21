import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { hasSameOrigin } from "@/lib/request-origin";

const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("password"),
      password: z.string().min(1).max(200),
      newPassword: z.string().min(12).max(200),
      confirmPassword: z.string().min(12).max(200),
    })
    .refine((value) => value.newPassword === value.confirmPassword),
  z.object({
    action: z.literal("add"),
    email: z.string().email().max(254),
    password: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal("email"),
    email: z.string().email().max(254),
    password: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal("delete"),
    confirmation: z.literal("DELETE"),
    password: z.string().min(1).max(200),
  }),
]);

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actor = await getAuthContext();
  if (
    !actor ||
    actor.role !== "ceo" ||
    actor.status !== "active" ||
    !actor.user.email
  )
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  // Re-authenticate on an isolated client; never replace or expose the browser session.
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: actor.user.email,
    password: parsed.data.password,
  });
  if (error || data.user?.id !== actor.user.id)
    return NextResponse.json(
      { error: "Password verification failed." },
      { status: 403 },
    );
  try {
    const input = parsed.data;
    const result =
      input.action === "add"
        ? await client.rpc("add_ceo", { account_email: input.email })
        : input.action === "delete"
          ? await client.rpc("delete_own_ceo_account")
          : input.action === "password"
            ? await client.auth.updateUser({ password: input.newPassword })
            : await client.auth.updateUser({ email: input.email });
    if (result.error)
      return NextResponse.json(
        {
          error:
            input.action === "delete"
              ? "Deletion failed. At least one active CEO must remain."
              : input.action === "add"
                ? "Choose an existing active account with a verified email."
                : "Unable to start email verification.",
        },
        { status: 400 },
      );
    return NextResponse.json({ ok: true });
  } finally {
    // This only revokes the temporary password-verification session.
    await client.auth.signOut({ scope: "local" });
  }
}
