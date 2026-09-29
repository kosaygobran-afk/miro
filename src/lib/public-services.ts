import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Public-facing DTO for a published service.
 * Only active services are returned to the public storefront.
 */
export type PublishedService = {
  id: string;
  slug: string;
  name_he: string;
  name_en: string;
  short_description_he: string | null;
  short_description_en: string | null;
  description_he: string | null;
  description_en: string | null;
  visual_kind: string;
  image_url: string | null;
  sort_order: number;
  seo_title_he: string | null;
  seo_title_en: string | null;
  seo_description_he: string | null;
  seo_description_en: string | null;
  content: ServiceContent;
  created_at: string;
  updated_at: string;
};

export type ServiceContent = {
  features?: FeatureItem[];
  process_steps?: StepItem[];
  faq?: FaqItem[];
  cta?: CtaItem;
  related_products?: RelatedProductItem[];
};

export type FeatureItem = {
  text_he: string;
  text_en: string;
};

export type StepItem = {
  title_he: string;
  text_he: string;
  title_en: string;
  text_en: string;
};

export type FaqItem = {
  question_he: string;
  answer_he: string;
  question_en: string;
  answer_en: string;
};

export type CtaItem = {
  text_he: string;
  text_en: string;
  href: string;
};

export type RelatedProductItem = {
  product_id: string;
  label_he: string;
  label_en: string;
};

/**
 * Fetches all published (active) services ordered by sort_order.
 * Server-only function - uses service role client for public reads.
 */
export async function getPublishedServices(): Promise<PublishedService[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("services")
    .select(
      "id, slug, name_he, name_en, short_description_he, short_description_en, description_he, description_en, visual_kind, image_url, sort_order, seo_title_he, seo_title_en, seo_description_he, seo_description_en, content, created_at, updated_at",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("slug", { ascending: true });

  if (error) {
    console.error("Failed to fetch published services:", error);
    return [];
  }

  return (data ?? []).map(mapServiceRow);
}

/**
 * Fetches a single published service by slug.
 * Returns null if not found or not active.
 * Server-only function - uses service role client for public reads.
 */
export async function getPublishedServiceBySlug(
  slug: string,
): Promise<PublishedService | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("services")
    .select(
      "id, slug, name_he, name_en, short_description_he, short_description_en, description_he, description_en, visual_kind, image_url, sort_order, seo_title_he, seo_title_en, seo_description_he, seo_description_en, content, created_at, updated_at",
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error(`Failed to fetch published service ${slug}:`, error);
    return null;
  }

  if (!data) return null;

  return mapServiceRow(data);
}

function mapServiceRow(row: {
  id: string;
  slug: string;
  name_he: string;
  name_en: string;
  short_description_he: string | null;
  short_description_en: string | null;
  description_he: string | null;
  description_en: string | null;
  visual_kind: string;
  image_url: string | null;
  sort_order: number;
  seo_title_he: string | null;
  seo_title_en: string | null;
  seo_description_he: string | null;
  seo_description_en: string | null;
  content: unknown;
  created_at: string;
  updated_at: string;
}): PublishedService {
  return {
    id: row.id,
    slug: row.slug,
    name_he: row.name_he,
    name_en: row.name_en,
    short_description_he: row.short_description_he,
    short_description_en: row.short_description_en,
    description_he: row.description_he,
    description_en: row.description_en,
    visual_kind: row.visual_kind,
    image_url: row.image_url,
    sort_order: row.sort_order,
    seo_title_he: row.seo_title_he,
    seo_title_en: row.seo_title_en,
    seo_description_he: row.seo_description_he,
    seo_description_en: row.seo_description_en,
    content: mapContent(row.content),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapContent(content: unknown): ServiceContent {
  if (!content || typeof content !== "object") {
    return {};
  }

  const obj = content as Record<string, unknown>;
  const result: ServiceContent = {};

  // Map features
  if (Array.isArray(obj.features)) {
    result.features = obj.features
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
      .map((item) => ({
        text_he: typeof item.text_he === "string" ? item.text_he : "",
        text_en: typeof item.text_en === "string" ? item.text_en : "",
      }))
      .filter((item) => item.text_he.trim() || item.text_en.trim());
  }

  // Map process steps
  if (Array.isArray(obj.process_steps)) {
    result.process_steps = obj.process_steps
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
      .map((item) => ({
        title_he: typeof item.title_he === "string" ? item.title_he : "",
        text_he: typeof item.text_he === "string" ? item.text_he : "",
        title_en: typeof item.title_en === "string" ? item.title_en : "",
        text_en: typeof item.text_en === "string" ? item.text_en : "",
      }))
      .filter(
        (item) =>
          item.title_he.trim() ||
          item.text_he.trim() ||
          item.title_en.trim() ||
          item.text_en.trim(),
      );
  }

  // Map FAQ
  if (Array.isArray(obj.faq)) {
    result.faq = obj.faq
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
      .map((item) => ({
        question_he: typeof item.question_he === "string" ? item.question_he : "",
        answer_he: typeof item.answer_he === "string" ? item.answer_he : "",
        question_en: typeof item.question_en === "string" ? item.question_en : "",
        answer_en: typeof item.answer_en === "string" ? item.answer_en : "",
      }))
      .filter(
        (item) =>
          item.question_he.trim() ||
          item.answer_he.trim() ||
          item.question_en.trim() ||
          item.answer_en.trim(),
      );
  }

  // Map CTA
  if (obj.cta && typeof obj.cta === "object" && obj.cta !== null) {
    const cta = obj.cta as Record<string, unknown>;
    if (
      typeof cta.text_he === "string" &&
      typeof cta.text_en === "string" &&
      typeof cta.href === "string"
    ) {
      result.cta = {
        text_he: cta.text_he,
        text_en: cta.text_en,
        href: cta.href,
      };
    }
  }

  // Map related products
  if (Array.isArray(obj.related_products)) {
    result.related_products = obj.related_products
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
      .map((item) => ({
        product_id:
          typeof item.product_id === "string" ? item.product_id : "",
        label_he:
          typeof item.label_he === "string" ? item.label_he : "",
        label_en:
          typeof item.label_en === "string" ? item.label_en : "",
      }))
      .filter((item) => item.product_id.trim());
  }

  return result;
}