"use client";
import Image from "next/image";
import { useState } from "react";
import { ProductVisual } from "@/components/products/ProductVisual";
import { getProductVisualKind } from "./product-visual-kind";
import type { Product } from "./product-data";
/** A failed external image never leaves an empty product stage. */
export function ProductMedia({
  product,
  src,
  alt,
  sizes,
  className = "",
}: {
  product: Product;
  src?: string;
  alt: string;
  sizes: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return src && failedSrc !== src ? (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      unoptimized={src.endsWith(".svg")}
      onError={() => setFailedSrc(src)}
    />
  ) : (
    <ProductVisual kind={getProductVisualKind(product)} />
  );
}
