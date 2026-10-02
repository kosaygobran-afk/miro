"use client";

import Link from "@/components/motion/motion-link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Cable,
  KeyRound,
  Router,
  Server,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { RevealImage as Image } from "@/components/ui/reveal-image";
import { isLocale, type Locale } from "@/lib/i18n";

const categoryIcons: Record<string, typeof Camera> = {
  cameras: Camera,
  servers: Server,
  routers: Router,
  cables: Cable,
  accessories: Wrench,
  networkGear: Router,
  alarms: ShieldCheck,
  intercom: KeyRound,
};

function getCategoryKeyFromPath(pathname: string): string | null {
  // Extract category from paths like /en/store/cameras or /he/store/alarms
  const match = pathname.match(/\/[a-z]{2}\/store\/([^/]+)/);
  return match ? match[1] : null;
}

export function ProductSubNav({
  categories,
  locale,
  ariaLabel = "Store categories",
}: {
  categories: Array<{
    key: string;
    href: string;
    label: string;
    imageUrl?: string | null;
  }>;
  locale: Locale;
  ariaLabel?: string;
}) {
  const pathname = usePathname();
  const currentCategory = getCategoryKeyFromPath(pathname);
  const isRtl = isLocale(locale) ? locale === "he" : false;
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  return (
    <nav className="sf-departments" aria-label={ariaLabel}>
      <div className="miro-container sf-department-grid">
        {categories.map((category) => {
          const Icon = categoryIcons[category.key] ?? ShieldCheck;
          const isActive = category.key === currentCategory;
          const isDescendant =
            currentCategory && pathname.startsWith(category.href);
          const ariaCurrent = isActive
            ? "page"
            : isDescendant
              ? "location"
              : undefined;

          return (
            <Link
              key={category.key}
              href={category.href}
              aria-current={ariaCurrent}
              className="sf-department"
            >
              {category.imageUrl ? (
                <Image
                  src={category.imageUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="sf-department-image"
                  aria-hidden="true"
                />
              ) : (
                <Icon
                  className="sf-department-icon"
                  size={25}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              )}
              <span>{category.label}</span>
              <Arrow
                className="sf-department-arrow"
                size={17}
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
