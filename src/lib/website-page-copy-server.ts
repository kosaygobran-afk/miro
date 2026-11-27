import "server-only";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { cachePublicPresentation } from "./public-presentation-cache";
import {
  defaultWebsitePageCopy,
  websitePageCopySchema,
  type WebsitePageKey,
  type WebsitePageText,
} from "./website-page-copy";
import type { Locale } from "./i18n";

export const PUBLIC_WEBSITE_PAGE_COPY_TAG = "public-website-page-copy";

const readPageCopy = cachePublicPresentation(
  PUBLIC_WEBSITE_PAGE_COPY_TAG,
  async () => {
    const { data, error } = await createPublicServerClient().rpc(
      "get_public_website_page_copy",
    );
    if (error) throw error;
    return websitePageCopySchema.parse(data);
  },
);

export async function getWebsitePageCopy(
  page: WebsitePageKey,
  locale: Locale,
): Promise<WebsitePageText> {
  const overrides = await readPageCopy().catch(() => null);
  return {
    ...defaultWebsitePageCopy[page][locale],
    ...overrides?.[page]?.[locale],
  };
}
