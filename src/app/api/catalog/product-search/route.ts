import { createPublicServerClient } from "@/lib/supabase/public-server";
import {
  readProductSearchParams,
  searchCatalogProducts,
} from "@/lib/catalog/product-search-server";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const params = readProductSearchParams(request);
  if (!params.success)
    return Response.json({ error: "invalid_query" }, { status: 400, headers });

  try {
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(6_000),
    ]);
    return Response.json(
      await searchCatalogProducts(
        createPublicServerClient(),
        params.data,
        signal,
      ),
      { headers },
    );
  } catch {
    return Response.json(
      { error: "search_unavailable" },
      { status: 503, headers },
    );
  }
}
