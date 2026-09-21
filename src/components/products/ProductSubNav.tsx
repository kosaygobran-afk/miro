"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpLeft,
  Camera,
  Cable,
  KeyRound,
  Router,
  Server,
  ShieldCheck,
  Wrench,
} from "lucide-react";

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

export function ProductSubNav({
  categories,
  ariaLabel = "Store categories",
}: {
  categories: Array<{ key: string; href: string; label: string }>;
  ariaLabel?: string;
}) {
  const pathname = usePathname();
  return (
    <nav className="sf-departments" aria-label={ariaLabel}>
      <div className="miro-container sf-department-grid">
        {categories.map((category) => {
          const Icon = categoryIcons[category.key] ?? ShieldCheck;
          return (
            <Link
              key={category.key}
              href={category.href}
              aria-current={pathname === category.href ? "page" : undefined}
              className="sf-department"
            >
              <Icon
                className="sf-department-icon"
                size={25}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>{category.label}</span>
              <ArrowUpLeft
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
