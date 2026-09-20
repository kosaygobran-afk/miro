"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface ProductSubNavProps {
  categories: Array<{ key: string; href: string; label: string }>;
}

export function ProductSubNav({ categories }: ProductSubNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-16 z-30 border-b border-border-subtle bg-background/95 backdrop-blur-xl"
      aria-label="Product categories"
    >
      <div className="miro-container">
        <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
          {categories.map((cat) => {
            const isActive = pathname === cat.href;
            return (
              <Link
                key={cat.key}
                href={cat.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold text-muted-foreground",
                  "hover:bg-surface-hover hover:text-foreground transition-all duration-200",
                  "relative after:absolute after:bottom-0 after:left-1/2 after:w-0 after:h-0.5 after:bg-primary after:-translate-x-1/2 after:transition-all after:duration-300",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isActive
                    ? "text-primary font-black bg-primary/5 after:w-full shadow-[0_2px_0_var(--primary)]"
                    : "hover:bg-primary/5",
                )}
              >
                {cat.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
