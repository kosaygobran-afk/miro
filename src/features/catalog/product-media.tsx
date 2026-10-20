"use client";
import { RevealImage } from "@/components/ui/reveal-image";
import { useEffect, useState, type ReactNode } from "react";
import { ProductVisual } from "@/components/products/ProductVisual";
import { getProductVisualKind } from "./product-visual-kind";
import type { Product } from "./product-data";

export type ProductImageSubject = Pick<
  Product,
  "id" | "name" | "category" | "icon"
>;
/** A failed external image never leaves an empty product stage. */
export function ProductMedia({
  product,
  src,
  alt,
  sizes,
  loading = "lazy",
  className = "",
  onImageReadyChange,
  fallback,
  fetchPriority,
}: {
  product: ProductImageSubject;
  src?: string;
  alt: string;
  sizes: string;
  loading?: "eager" | "lazy";
  className?: string;
  onImageReadyChange?: (ready: boolean) => void;
  fallback?: ReactNode;
  fetchPriority?: "high" | "low" | "auto";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  useEffect(() => {
    onImageReadyChange?.(
      Boolean(src && loadedSrc === src && failedSrc !== src),
    );
  }, [src, loadedSrc, failedSrc, onImageReadyChange]);
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
        fetchPriority={fetchPriority}
        className={className}
        unoptimized={src.split(/[?#]/, 1)[0].toLowerCase().endsWith(".svg")}
        onLoad={() => setLoadedSrc(src)}
        onError={() => setFailedSrc(src)}
      />
    </span>
  ) : (
    (fallback ?? <ProductVisual kind={getProductVisualKind(product)} />)
  );
}
