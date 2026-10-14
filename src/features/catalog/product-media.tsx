"use client";
import { RevealImage } from "@/components/ui/reveal-image";
import { useEffect, useState } from "react";
import { ProductVisual } from "@/components/products/ProductVisual";
import { getProductVisualKind } from "./product-visual-kind";
import type { Product } from "./product-data";
/** A failed external image never leaves an empty product stage. */
export function ProductMedia({
  product,
  src,
  alt,
  sizes,
  loading = "lazy",
  className = "",
}: {
  product: Product;
  src?: string;
  alt: string;
  sizes: string;
  loading?: "eager" | "lazy";
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  useEffect(() => {
    // Visible popup media must settle even if the image request/decode never
    // emits load or error. Lazy catalog images keep their normal loading policy.
    if (!src || loading !== "eager" || loadedSrc === src || failedSrc === src)
      return;
    const timer = window.setTimeout(() => setFailedSrc(src), 8_000);
    return () => window.clearTimeout(timer);
  }, [src, loading, loadedSrc, failedSrc]);
  return src && failedSrc !== src ? (
    <span className="sf-product-image-fit">
      <RevealImage
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        loading={loading}
        className={className}
        unoptimized={src.endsWith(".svg")}
        onLoad={() => setLoadedSrc(src)}
        onError={() => setFailedSrc(src)}
      />
    </span>
  ) : (
    <ProductVisual kind={getProductVisualKind(product)} />
  );
}
