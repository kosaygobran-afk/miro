// Additive public artwork publication. Keeps live catalog media usable before
// the next frontend deployment; never overwrites an owner's replacement image.
import { readFile, readdir } from "node:fs/promises";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
nextEnv.loadEnvConfig(process.cwd());
const files = (await readdir("public/images/catalog")).filter((name) =>
  name.endsWith(".svg"),
);
if (!process.argv.includes("--apply")) {
  console.log({
    files: files.length,
    operation:
      "publish original SVG artwork and replace only matching local catalog URLs",
  });
  process.exit(0);
}
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const check = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
// The historical SQL migration deliberately skips storage setup if its role
// cannot own the storage schema. Provision the documented bucket via Storage API.
const bucket = await service.storage.getBucket("product-media");
if (bucket.error) {
  if (bucket.error.message !== "Bucket not found")
    throw new Error(bucket.error.message);
  check(
    await service.storage.createBucket("product-media", {
      public: true,
      fileSizeLimit: 5242880,
      allowedMimeTypes: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/avif",
        "image/svg+xml",
      ],
    }),
  );
}
let linked = 0;
for (const name of files) {
  const path = `storefront/catalog/${name}`;
  const content = await readFile(`public/images/catalog/${name}`);
  const uploaded = await service.storage
    .from("product-media")
    .upload(path, content, {
      contentType: "image/svg+xml",
      cacheControl: "31536000",
      upsert: false,
    });
  if (
    uploaded.error &&
    uploaded.error.message !== "The resource already exists"
  )
    throw new Error(uploaded.error.message);
  const { data } = service.storage.from("product-media").getPublicUrl(path);
  const response = await fetch(data.publicUrl);
  if (!response.ok || !(await response.text()).includes("<svg"))
    throw new Error(`Public asset failed: ${name}`);
  const changed = check(
    await service
      .from("product_images")
      .update({ image_url: data.publicUrl })
      .eq("image_url", `/images/catalog/${name}`)
      .select("id"),
  );
  linked += changed.length;
}
check(
  await service.from("audit_events").insert({
    action: "catalog_reference_media_publish",
    user_id: null,
    entity_type: "catalog",
    details: {
      source: "scripts/publish-reference-assets.mjs",
      original_svg_assets: files.length,
      image_rows_linked: linked,
    },
  }),
);
console.log({ published: files.length, linked, publicFetch: "passed" });
