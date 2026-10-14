"use client";

import { cn } from "./pos-utils";

export function PosSkeleton() {
  return (
    <div
      className={cn(
        "grid gap-3",
        "grid-cols-2",
        "md:grid-cols-3",
        "lg:grid-cols-4",
        "xl:grid-cols-5",
        "2xl:grid-cols-6",
      )}
      role="status"
      aria-label="Loading products"
    >
      {/* Render 12 skeleton cards */}
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="relative flex min-h-[140px] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface animate-pulse"
        >
          {/* Image skeleton */}
          <div className="aspect-square bg-surface-muted" />
          {/* Content skeleton */}
          <div className="flex flex-1 flex-col p-3 space-y-3">
            <div className="h-4 w-3/4 bg-surface-muted rounded" />
            <div className="h-3 w-1/2 bg-surface-muted rounded" />
            <div className="h-3 w-1/3 bg-surface-muted rounded" />
            <div className="mt-auto h-6 w-1/4 bg-surface-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
