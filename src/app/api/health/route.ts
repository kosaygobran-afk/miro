import { NextResponse } from "next/server";
import { commerceReadiness } from "@/lib/commerce/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unauthenticated liveness/readiness surface for schedulers and monitoring.
// Boolean status only: no configuration values, credentials, row data or stack
// traces. The database ping reuses the public store_catalog_version read
// grant, so no privileged access is involved and an RLS-outage is detectable.
export async function GET() {
  const startedAt = Date.now();
  let database: "ok" | "unavailable" = "unavailable";
  let catalogVersion: number | null = null;
  try {
    const client = await createServerSupabaseClient();
    const { data, error } = await client
      .from("store_catalog_version")
      .select("version")
      .limit(1);
    if (!error && data && data.length === 1) {
      database = "ok";
      catalogVersion = (data[0]?.version as number | undefined) ?? null;
    }
  } catch {
    // Missing/invalid Supabase configuration reports as unavailable below.
  }
  const commerce = commerceReadiness();
  const ok = database === "ok";
  return NextResponse.json(
    {
      ok,
      database,
      catalog_version: catalogVersion,
      commerce: {
        configured: commerce.configured,
        environment: commerce.environment,
        official_issuance_enabled: commerce.official_issuance_enabled,
      },
      latency_ms: Date.now() - startedAt,
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
