import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseFetch, supabaseFetchFast } from "./fetch";

function getPublicSupabaseKey() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not configured.");
  }

  return key;
}

async function createCookieServerClient(
  fetchImpl: typeof fetch,
): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getPublicSupabaseKey(),
    {
      global: { fetch: fetchImpl },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server components cannot always write cookies; proxy refresh handles that case.
          }
        },
      },
    },
  );
}

// React caches only within a server render. Route handlers have no render
// cache, so mutable cookie/session clients never persist across requests.
export const createServerSupabaseClient = cache(
  async (): Promise<SupabaseClient> => createCookieServerClient(supabaseFetch),
);

/**
 * Cookie-bound client for non-critical request paths. It keeps the same session
 * semantics as the default client but fails within the fast transport budget.
 */
export async function createFastServerSupabaseClient(): Promise<SupabaseClient> {
  return createCookieServerClient(supabaseFetchFast);
}
