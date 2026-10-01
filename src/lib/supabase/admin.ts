import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const privateKey = process.env.SUPABASE_SECRET_KEY;
  if (!privateKey) {
    throw new Error("A Supabase private server key is not configured.");
  }

  if (
    privateKey.startsWith("sb_publishable_") ||
    privateKey === process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    privateKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error(
      "The Supabase server key must be private, not a public API key.",
    );
  }

  adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    privateKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return adminClient;
}

export function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    return createAdminClient();
  }
  return adminClient;
}
