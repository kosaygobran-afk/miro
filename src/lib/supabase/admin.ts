import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseFetch } from "./fetch";

let adminClient: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const privateKey = process.env.SUPABASE_SECRET_KEY;
  if (!privateKey) {
    throw new Error("A Supabase private server key is not configured.");
  }

  if (!/^(sb_secret_|eyJ)/.test(privateKey)) {
    throw new Error("The Supabase private server key has an invalid format.");
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
      global: { fetch: supabaseFetch },
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
