import { NextResponse } from "next/server";
import { z } from "zod";
import { getStoreCatalog, getStoreViewer } from "@/lib/store-data";
import { hasSameOrigin } from "@/lib/request-origin";
import { shouldHideFromPublic } from "@/lib/catalog/pricing";
import { readCommerceJson } from "@/lib/commerce/http";

const schema = z.object({
  locale: z.enum(["he", "en"]),
  ids: z.array(z.uuid()).min(1).max(48),
});

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!hasSameOrigin(request))
    return new NextResponse(null, { status: 403, headers });
  const parsed = schema.safeParse(
    await readCommerceJson(request).catch(() => null),
  );
  if (!parsed.success) return new NextResponse(null, { status: 400, headers });

  const { role } = await getStoreViewer();
  const catalog = await getStoreCatalog(parsed.data.locale, role, !role);
  if (catalog.error) return new NextResponse(null, { status: 503, headers });

  const ids = new Set(parsed.data.ids);
  const products = catalog.products.filter(
    (product) =>
      ids.has(product.id) &&
      !shouldHideFromPublic(product.outOfStockPolicy, product.stockQty),
  );
  return NextResponse.json({ products }, { headers });
}
