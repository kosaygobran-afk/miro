"use client";
// Copied only into an isolated temporary Next app by verify-variant-experience.py.
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OverlayStackProvider } from "@/components/management/ui/overlay-stack";
import { AnimationProvider } from "@/components/motion/animation-provider";
import { DEFAULT_ANIMATION_SETTINGS } from "@/lib/animation-settings";
import { CartProvider } from "@/features/cart/cart-context";
import { ProductDetailInteractive } from "@/components/products/ProductDetailInteractive";
import { ProductHoverPreview } from "@/features/catalog/product-hover-preview";
import { MediaGallery } from "@/components/management/product-editor/media-gallery";
import { VariantsSection } from "@/components/management/product-editor/variants-section";
import type { ProductVariant as ManagementVariant } from "@/components/management/product-editor/types";
import type { Product } from "@/features/catalog/product-data";

function Harness() {
  const params = useSearchParams();
  const locale = params.get("locale") === "he" ? "he" : "en";
  const rolePrice =
    params.get("price") === "none"
      ? undefined
      : Number(params.get("price") || 100);
  const mode = params.get("mode") || "detail";
  const appearanceVersion = params.get("version") === "1" ? "1" : "2";
  useEffect(() => {
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
  }, [locale]);
  const [open, setOpen] = useState(false);
  const [variants, setVariants] = useState<ManagementVariant[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const product: Product = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "QA product",
    description: "QA only",
    priceIls: 180,
    basePriceIls: params.get("base") === "none" ? null : 100,
    rolePrice,
    slug: "qa-variants",
    category: "qa",
    categorySlug: "qa",
    stockQty: 5,
    stockState: "in_stock",
    outOfStockPolicy: "keep_visible_contact",
    trackingMode: "none",
    expectedRestockDate: null,
    publicPromotion: { type: "percent", value: 10, compareAtPrice: null },
    variants: [
      {
        id: "a",
        sku: "QA-A",
        colorHe: "שחור",
        colorEn: "Black",
        colorHex: "#111111",
        price: 200,
        stockQty: 3,
        lowStockThreshold: 0,
        isDefault: true,
      },
      {
        id: "b",
        sku: "QA-B",
        colorHe: "לבן",
        colorEn: "White",
        colorHex: "#eeeeee",
        price: 300,
        stockQty: 0,
        lowStockThreshold: 0,
      },
      {
        id: "c",
        sku: "QA-C",
        colorHe: "כללי",
        colorEn: "General",
        colorHex: "#777777",
        price: null,
        stockQty: 2,
        lowStockThreshold: 0,
      },
    ],
    images: [
      { id: "g", url: "https://variant-qa.invalid/general.svg", sortOrder: 0 },
      {
        id: "a1",
        url: "https://variant-qa.invalid/a1.svg",
        sortOrder: 1,
        variantId: "a",
      },
      {
        id: "a2",
        url: "https://variant-qa.invalid/a2.svg",
        sortOrder: 2,
        variantId: "a",
      },
      {
        id: "b1",
        url: "https://variant-qa.invalid/b1.svg",
        sortOrder: 3,
        variantId: "b",
      },
    ],
  };
  return (
    <AnimationProvider
      settings={{
        ...DEFAULT_ANIMATION_SETTINGS,
        enabled: false,
        appearanceVersion,
      }}
    >
      <CartProvider>
        <OverlayStackProvider>
          <main
            dir={locale === "he" ? "rtl" : "ltr"}
            className={
              mode === "management" ? "mgmt-shell-root" : "sf-product-detail"
            }
          >
            {mode === "management" ? (
              <>
                <MediaGallery
                  locale={locale}
                  productId={product.id}
                  variants={variants}
                />
                <VariantsSection
                  locale={locale}
                  productId={product.id}
                  variants={variants}
                  onVariantsChange={setVariants}
                  suppliers={[]}
                />
              </>
            ) : mode === "preview" ? (
              <>
                <button
                  type="button"
                  ref={trigger}
                  onClick={() => setOpen(true)}
                >
                  Open preview
                </button>
                <ProductHoverPreview
                  product={product}
                  locale={locale}
                  isOpen={open}
                  onClose={() => setOpen(false)}
                  triggerRef={trigger}
                  hoverSourceRef={trigger}
                  actionsRef={trigger}
                  returnFocusRef={trigger}
                  focusOnOpen
                />
              </>
            ) : (
              <div className="miro-container sf-product-detail-layout">
                <ProductDetailInteractive
                  productId={product.id}
                  productSlug={product.slug}
                  productCategory={product.category}
                  productName={product.name}
                  locale={locale}
                  basePrice={
                    product.basePriceIls !== undefined
                      ? product.basePriceIls
                      : product.priceIls
                  }
                  images={product.images}
                  variants={product.variants}
                  defaultVariantId="a"
                  visualKind="dome"
                  contact={null}
                  header={<h1>QA product</h1>}
                  stockBadge={<span>Aggregate in stock</span>}
                  stockQty={5}
                  description={<p>QA only</p>}
                  footer={null}
                  roleOverride={rolePrice ?? null}
                  publicPromotion={product.publicPromotion}
                />
              </div>
            )}
          </main>
        </OverlayStackProvider>
      </CartProvider>
    </AnimationProvider>
  );
}
export default function Fixture() {
  return (
    <Suspense>
      <Harness />
    </Suspense>
  );
}
