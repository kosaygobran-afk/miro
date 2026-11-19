import type { Product } from "./product-data";

/** Display the catalog's root and optional child in reading order. */
export function ProductCategoryPath({
  product,
}: {
  product: Pick<Product, "category" | "categoryLabel" | "subcategoryLabel">;
}) {
  return (
    <span className="sf-category-path">
      <bdi>{product.categoryLabel ?? product.category}</bdi>
      {product.subcategoryLabel && (
        <>
          {" / "}
          <bdi>{product.subcategoryLabel}</bdi>
        </>
      )}
    </span>
  );
}
