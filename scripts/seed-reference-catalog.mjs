// Additive, repeatable catalog import. Never fabricates selling prices or stock.
// Run without --apply to preview. Existing matching models/owner edits are kept.
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
nextEnv.loadEnvConfig(process.cwd());
const fixture = JSON.parse(
  await readFile("data/reference-catalog.json", "utf8"),
);
if (!process.argv.includes("--apply")) {
  console.log({
    categories: fixture.categories.length,
    models: fixture.products.length,
    prices: "unpublished",
    stock: "zero; confirmation required",
    operation: "add missing references, preserve existing products",
  });
  process.exit(0);
}
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (url, init) =>
      fetch(url, { ...init, signal: AbortSignal.timeout(20000) }),
  },
};
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  options,
);
const actor = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  options,
);
const check = (result) => {
  if (result.error)
    throw new Error(`${result.error.code || ""}: ${result.error.message}`);
  return result.data;
};
let userId;
let createdCount = 0;
try {
  await import("./publish-reference-assets.mjs");
  const email = `catalog-import-${Date.now()}@miro-test.local`,
    password = `Catalog-${randomUUID()}!`;
  const auth = check(
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Automated reference catalog import" },
    }),
  );
  userId = auth.user.id;
  check(
    await service
      .from("user_roles")
      .upsert({ user_id: userId, role: "ceo" }, { onConflict: "user_id" }),
  );
  check(
    await service
      .from("profiles")
      .update({ role: "ceo", account_status: "active" })
      .eq("id", userId),
  );
  check(await actor.auth.signInWithPassword({ email, password }));
  const categories = check(await service.from("categories").select("id,slug"));
  for (let index = 0; index < fixture.categories.length; index++) {
    const [slug, name_he, name_en] = fixture.categories[index];
    if (categories.some((category) => category.slug === slug)) continue;
    const category = check(
      await actor.rpc("manage_category", {
        p_action: "create",
        p_category_id: null,
        p_payload: {
          slug,
          name_he,
          name_en,
          sort_order: 10 + index,
        },
      }),
    );
    categories.push({ id: category, slug });
  }
  // Improve the existing accessories label without changing its identity or products.
  const tools = categories.find((category) => category.slug === "tools");
  const existingTools = check(
    await service
      .from("categories")
      .select("name_en")
      .eq("id", tools.id)
      .single(),
  );
  if (existingTools.name_en === "tools")
    check(
      await actor.rpc("manage_category", {
        p_action: "update",
        p_category_id: tools.id,
        p_payload: {
          name_he: "אביזרים והתקנה",
          name_en: "Installation & accessories",
        },
      }),
    );
  const existing = check(
    await service
      .from("products")
      .select("id,slug,brand,model_number,status,metadata"),
  );
  const rail = check(
    await service.from("storefront_rail_items").select("product_id,sort_order"),
  );
  let railOrder = Math.max(-1, ...rail.map((item) => item.sort_order)) + 1;
  for (let index = 0; index < fixture.products.length; index++) {
    const ref = fixture.products[index];
    if (
      existing.some(
        (product) =>
          product.slug === ref.slug ||
          (product.brand === ref.brand && product.model_number === ref.model),
      )
    ) {
      console.log("KEPT", ref.slug);
      continue;
    }
    const product = check(
      await actor.rpc("create_catalog_product", {
        p_slug: ref.slug,
        p_name_he: `${ref.brand} ${ref.nameHe}`,
        p_name_en: `${ref.brand} ${ref.name}`,
        p_category_id: categories.find(
          (category) => category.slug === ref.category,
        ).id,
      }),
    );
    // Internal barcode is deliberately non-GTIN. Replace with actual supplier barcode before receiving stock.
    check(
      await actor.rpc("create_catalog_variant", {
        p_data: {
          product_id: product.id,
          sku: `REF-${ref.model}`.slice(0, 100),
          barcode: `MIRO-REF-${product.id}`,
          is_default: true,
        },
      }),
    );
    const noteEn =
      " Price and local availability require confirmation. The images are original hardware illustrations, not manufacturer photographs.";
    const noteHe =
      " המחיר והזמינות המקומית דורשים אישור. התמונות הן איורי חומרה מקוריים ואינן צילומי יצרן.";
    check(
      await actor.rpc("update_product", {
        p_id: product.id,
        p_patch: {
          brand: ref.brand,
          model_number: ref.model,
          short_description_en: ref.description,
          short_description_he: ref.descriptionHe,
          description_en: ref.description + noteEn,
          description_he: ref.descriptionHe + noteHe,
          specifications: ref.specifications,
          price: null,
          sort_order: 100 + index,
          out_of_stock_policy: "keep_visible_contact",
          tags: ["catalog-reference"],
          metadata: {
            reference_import: "2026-10-02",
            manufacturer_source: ref.source,
            verified_at: fixture.verifiedAt,
            illustrative_media: true,
            barcode_type: "internal-reference-not-GTIN",
            pricing_approval: "pending",
            availability_approval: "pending",
          },
        },
      }),
    );
    for (let imageIndex = 1; imageIndex <= 3; imageIndex++) {
      const { data: media } = service.storage
        .from("product-media")
        .getPublicUrl(`storefront/catalog/${ref.kind}-0${imageIndex}.svg`);
      const url = media.publicUrl;
      check(
        await service.from("product_images").insert({
          product_id: product.id,
          image_url: url,
          sort_order: imageIndex - 1,
          alt_en: `${ref.brand} ${ref.name} — illustrative hardware view; not a manufacturer photo`,
          alt_he: `${ref.brand} ${ref.nameHe} — איור חומרה, לא צילום יצרן`,
        }),
      );
    }
    check(await actor.rpc("publish_product", { p_product: product.id }));
    // One model from each category keeps the moving rail varied and manageable.
    if (index % 5 === 0)
      check(
        await service.from("storefront_rail_items").insert({
          product_id: product.id,
          sort_order: railOrder++,
          created_by: userId,
        }),
      );
    createdCount++;
    console.log("ADDED", ref.slug);
  }
  check(
    await service.from("audit_events").insert({
      action: "catalog_reference_import",
      user_id: null,
      entity_type: "catalog",
      details: {
        source: "scripts/seed-reference-catalog.mjs",
        imported_models: createdCount,
        date: fixture.verifiedAt,
        prices: "unpublished",
        stock: "zero",
        reference_barcodes: "internal, not supplier GTIN",
      },
    }),
  );
  console.log({
    created: createdCount,
    categories: categories.length,
    source: "data/reference-catalog.json",
  });
} finally {
  if (userId) {
    check(
      await service
        .from("user_roles")
        .update({ role: "customer" })
        .eq("user_id", userId),
    );
    check(
      await service
        .from("profiles")
        .update({ role: "customer" })
        .eq("id", userId),
    );
    check(await service.auth.admin.deleteUser(userId));
  }
}
