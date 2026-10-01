import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let publicServerClient: SupabaseClient | null = null;

function getPublicSupabaseKey() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not configured.");
  }

  return key;
}

/**
 * Cookie-free Supabase client for anonymous server reads.
 *
 * It keeps public routes independent of request-time cookies while preserving
 * the database's anonymous RLS policies. Never use it for authenticated data.
 */
export function createPublicServerClient(): SupabaseClient {
  if (publicServerClient) return publicServerClient;

  publicServerClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getPublicSupabaseKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return publicServerClient;
}
