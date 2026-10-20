"use client";

import Link from "@/components/motion/motion-link";
import { useAnimationSettings } from "@/components/motion/animation-provider";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CornerDownLeft,
  CornerDownRight,
  Camera,
  Cable,
  KeyRound,
  Router,
  Server,
  ShieldCheck,
  Wrench,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { RevealImage as Image } from "@/components/ui/reveal-image";
import { isLocale, type Locale } from "@/lib/i18n";
import { getCategoryKeyFromSlug } from "@/lib/catalog/routes";

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
  return match ? getCategoryKeyFromSlug(match[1]) : null;
}

export function ProductSubNav({
  categories,
  locale,
  ariaLabel = "Store categories",
  collapsible = false,
}: {
  categories: Array<{
    key: string;
    href: string;
    label: string;
    imageUrl?: string | null;
  }>;
  locale: Locale;
  ariaLabel?: string;
  collapsible?: boolean;
}) {
  const pathname = usePathname();
  const currentCategory = getCategoryKeyFromPath(pathname);
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const visibleCategories =
    collapsible && !expanded
      ? categories.filter((category) => category.key === currentCategory)
      : categories;
  const isRtl = isLocale(locale) ? locale === "he" : false;
  const enhanced = useAnimationSettings().appearanceVersion === "2";
  const Arrow = enhanced
    ? isRtl
      ? CornerDownRight
      : CornerDownLeft
    : isRtl
      ? ArrowLeft
      : ArrowRight;

  return (
    <nav
      className={`sf-departments${collapsible ? " sf-departments-collapsible" : ""}`}
      aria-label={ariaLabel}
      data-expanded={collapsible ? expanded : undefined}
    >
      {collapsible && (
        <div className="miro-container sf-departments-controls">
          <p>{locale === "he" ? "קטגוריות ראשיות" : "Main categories"}</p>
          <button
            type="button"
            className="miro-centered-control"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? (
              <ChevronUp
                className="miro-control-start"
                size={20}
                aria-hidden="true"
              />
            ) : (
              <ChevronDown
                className="miro-control-start"
                size={20}
                aria-hidden="true"
              />
            )}
            <span className="miro-control-label">
              {expanded
                ? locale === "he"
                  ? "צמצום קטגוריות"
                  : "Collapse categories"
                : locale === "he"
                  ? "הצגת כל הקטגוריות"
                  : "Expand categories"}
            </span>
          </button>
        </div>
      )}
      <div className="miro-container sf-department-grid" id={panelId}>
        {visibleCategories.map((category) => {
          const Icon = categoryIcons[category.key] ?? ShieldCheck;
          const isActive = category.key === currentCategory;

          return (
            <Link
              key={category.key}
              href={category.href}
              prefetch={false}
              aria-current={isActive ? "page" : undefined}
              className="sf-department miro-centered-control"
            >
              {category.imageUrl ? (
                <Image
                  src={category.imageUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="sf-department-image miro-control-start"
                  aria-hidden="true"
                />
              ) : (
                <Icon
                  className="sf-department-icon miro-control-start"
                  size={25}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              )}
              <span className="miro-control-label">{category.label}</span>
              <Arrow
                className="sf-department-arrow miro-control-end"
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
