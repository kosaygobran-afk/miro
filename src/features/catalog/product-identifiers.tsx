import type { ProductVariant } from "./product-data";

export type ProductIdentifiersProps = {
  sku?: string | null;
  barcode?: string | null;
  model?: string | null;
  locale: "he" | "en";
  compact?: boolean;
  className?: string;
};

/** Match the catalog's default available variant when no selection is supplied. */
export function getProductIdentifierVariant(
  variants: ProductVariant[],
): ProductVariant | null {
  return (
    variants.find((variant) => variant.isDefault && variant.stockQty > 0) ??
    variants.find((variant) => variant.stockQty > 0) ??
    variants.find((variant) => variant.isDefault) ??
    variants[0] ??
    null
  );
}

/** Display the supplied variant's actual identifiers without inventing codes. */
export function ProductIdentifiers({
  sku,
  barcode,
  model,
  locale,
  compact = false,
  className,
}: ProductIdentifiersProps) {
  const he = locale === "he";
  const normalizedBarcode = barcode?.trim();
  const internalCatalogCode = /^MIRO-REF-/i.test(normalizedBarcode ?? "");
  const identifiers = [
    { kind: "sku", label: he ? "מק״ט" : "SKU", value: sku?.trim() },
    {
      kind: "barcode",
      label: internalCatalogCode
        ? he
          ? "קוד קטלוג פנימי"
          : "Internal catalog code"
        : he
          ? "ברקוד"
          : "Barcode",
      value: normalizedBarcode,
    },
    { kind: "model", label: he ? "דגם" : "Model", value: model?.trim() },
  ].filter((identifier) => identifier.value);

  if (!identifiers.length) return null;

  return (
    <dl
      className={[
        "product-identifiers",
        compact && "product-identifiers--compact",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {identifiers.map(({ kind, label, value }) => (
        <div
          key={kind}
          className={`product-identifier product-identifier--${kind}`}
          data-product-identifier={kind}
        >
          <dt className="product-identifier-label">{label}</dt>
          <dd
            className="product-identifier-value"
            dir={kind === "model" ? "auto" : "ltr"}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
