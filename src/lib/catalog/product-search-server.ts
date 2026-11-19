import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { OutOfStockPolicy } from "@/features/catalog/inventory-types";
import { locales, type Locale } from "@/lib/i18n";
import {
  getInventoryDefaults,
  resolveOutOfStockPolicy,
  shouldHideFromPublic,
} from "@/lib/store-data";
import { getProductStorefrontHref } from "./routes";
import {
  PRODUCT_SEARCH_LIMIT,
  PRODUCT_SEARCH_QUERY_MAX_LENGTH,
  type ProductSearchItem,
  type ProductSearchPage,
} from "./product-search";

type SearchCursor = { tier: "exact" | "partial"; offset: number };

const productSearchParams = z.object({
  q: z.string().trim().min(1).max(PRODUCT_SEARCH_QUERY_MAX_LENGTH),
  locale: z.enum(locales),
  cursor: z
    .string()
    .regex(/^(exact|partial):\d{1,8}$/)
    .optional(),
  page: z.coerce.number().int().min(1).max(10000).optional().default(1),
});

const fields = ["name_he", "name_en", "brand", "model_number", "slug"];
const variantFields = ["sku", "barcode"];
const batchSize = 18;
const firstCursor: SearchCursor = { tier: "exact", offset: 0 };

type VariantCodes = { sku: string | null; barcode: string | null };
type SearchRow = {
  id: string;
  slug: string;
  name_he: string | null;
  name_en: string | null;
  brand: string | null;
  model_number: string | null;
  image_url: string | null;
  product_images: Array<{ image_url: string }>;
  match_codes: VariantCodes[];
  default_codes: VariantCodes[];
  root: { id: string; slug: string };
  child: { parent_id: string } | null;
  subcategory_id: string | null;
  out_of_stock_policy: OutOfStockPolicy | null;
  stock: Array<{ stock_qty: number }>;
};

const columns = `
  id, slug, name_he, name_en, brand, model_number, image_url,
  product_images(image_url), match_codes:product_variants(sku,barcode),
  exact_codes:product_variants(id), default_codes:product_variants(sku,barcode),
  subcategory_id, out_of_stock_policy, stock:product_variants(stock_qty),
  root:categories!products_category_id_fkey!inner(id,slug),
  child:categories!products_subcategory_id_fkey(parent_id)
`;

export function readProductSearchParams(request: Request) {
  return productSearchParams.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
}

function searchPatterns(term: string) {
  // Treat the term as literal in both PostgreSQL's regex and PostgREST's
  // quoted logical filters. Codes can contain %, *, hyphens and punctuation.
  const literal = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const quote = (value: string) => `"${value.replace(/[\\"]/g, "\\$&")}"`;
  return { exact: quote(`^${literal}$`), partial: quote(literal) };
}

function matches(columns: string[], pattern: string) {
  return columns.map((column) => `${column}.imatch.${pattern}`).join(",");
}

async function readMatches(
  supabase: SupabaseClient,
  patterns: ReturnType<typeof searchPatterns>,
  { tier, offset }: SearchCursor,
  signal: AbortSignal,
) {
  const pattern = patterns[tier];
  let query = supabase
    .from("products")
    .select(columns)
    .eq("status", "active")
    .eq("root.is_active", true)
    .is("root.parent_id", null)
    .eq("child.is_active", true)
    .or("subcategory_id.is.null,child.not.is.null")
    .eq("stock.is_active", true)
    .or(matches(variantFields, pattern), { referencedTable: "match_codes" })
    .or(`${matches(fields, pattern)},match_codes.not.is.null`)
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .order("sort_order", { referencedTable: "product_images" })
    .order("id", { referencedTable: "product_images" })
    .limit(1, { referencedTable: "product_images" });

  for (const alias of ["match_codes", "default_codes"]) {
    query = query
      .eq(`${alias}.is_active`, true)
      .order("is_default", { ascending: false, referencedTable: alias })
      .order("id", { referencedTable: alias })
      .limit(1, { referencedTable: alias });
  }

  if (tier === "partial") {
    const nonExact = fields.map(
      (column) =>
        `or(${column}.not.imatch.${patterns.exact},${column}.is.null)`,
    );
    query = query
      .or(matches(variantFields, patterns.exact), {
        referencedTable: "exact_codes",
      })
      .limit(1, { referencedTable: "exact_codes" })
      .eq("exact_codes.is_active", true)
      .or(`and(${nonExact.join(",")},exact_codes.is.null)`);
  } else {
    query = query.limit(0, { referencedTable: "exact_codes" });
  }

  const { data, error } = await query
    .range(offset, offset + batchSize - 1)
    .abortSignal(signal)
    .overrideTypes<SearchRow[], { merge: false }>();
  if (error) throw error;
  return data;
}

function toItem(row: SearchRow, locale: Locale): ProductSearchItem {
  const name = locale === "he" ? row.name_he : row.name_en;
  const otherName = locale === "he" ? row.name_en : row.name_he;
  const codes = row.match_codes[0] ?? row.default_codes[0];
  return {
    id: row.id,
    href: getProductStorefrontHref(locale, row.root.slug, row.slug ?? row.id),
    name: name?.trim() || otherName?.trim() || row.slug,
    brand: row.brand,
    model: row.model_number,
    sku: codes?.sku ?? null,
    barcode: codes?.barcode ?? null,
    imageUrl:
      row.product_images[0]?.image_url?.trim() || row.image_url?.trim() || null,
  };
}

export async function searchCatalogProducts(
  supabase: SupabaseClient,
  { q, locale, cursor, page }: z.infer<typeof productSearchParams>,
  signal: AbortSignal,
): Promise<ProductSearchPage> {
  const term = q.replace(/[\u0000-\u001f\u007f]/gu, " ").trim();
  const results: ProductSearchItem[] = [];
  if (!term) return { results, hasMore: false, nextCursor: null };
  const patterns = searchPatterns(term);
  const [tier, rawOffset] = cursor?.split(":") ?? [];
  let start: SearchCursor =
    tier === "exact" || tier === "partial"
      ? { tier, offset: Number(rawOffset) }
      : firstCursor;
  let skip = cursor ? 0 : (page - 1) * PRODUCT_SEARCH_LIMIT;

  const [defaults, initialRows] = await Promise.all([
    getInventoryDefaults(signal),
    readMatches(supabase, patterns, start, signal),
  ]);

  let rows = initialRows;
  for (;;) {
    for (const [index, row] of rows.entries()) {
      if (
        !row.root ||
        (row.subcategory_id && row.child?.parent_id !== row.root.id)
      )
        continue;
      const policy = resolveOutOfStockPolicy(
        row.out_of_stock_policy ?? "inherit",
        defaults,
      );
      const stock = (row.stock ?? []).reduce(
        (sum, variant) => sum + variant.stock_qty,
        0,
      );
      if (shouldHideFromPublic(policy, stock)) continue;
      if (skip > 0) {
        skip -= 1;
        continue;
      }
      if (results.length === PRODUCT_SEARCH_LIMIT) {
        return {
          results,
          hasMore: true,
          nextCursor: `${start.tier}:${start.offset + index}`,
        };
      }
      results.push(toItem(row, locale));
    }

    if (rows.length === batchSize) {
      start = { tier: start.tier, offset: start.offset + rows.length };
    } else if (start.tier === "exact") {
      start = { tier: "partial", offset: 0 };
    } else {
      return { results, hasMore: false, nextCursor: null };
    }
    rows = await readMatches(supabase, patterns, start, signal);
  }
}
