"use client";

import {
  Award,
  Clock3,
  Crown,
  Flame,
  Gift,
  Percent,
  Shield,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useAnimationSettings } from "@/components/motion/animation-provider";
import type { PromoBadge as Badge } from "@/features/catalog/product-data";
import { LegacyPromoBadge } from "./product-promo-badge-legacy";
import styles from "./product-promo-badge.module.css";

/** Shared by the storefront and the badge editor's icon choices. */
export const PROMO_BADGE_ICONS = [
  { name: "percent", Icon: Percent },
  { name: "award", Icon: Award },
  { name: "sparkles", Icon: Sparkles },
  { name: "flame", Icon: Flame },
  { name: "clock", Icon: Clock3 },
  { name: "tag", Icon: Tag },
  { name: "star", Icon: Star },
  { name: "crown", Icon: Crown },
  { name: "bolt", Icon: Zap },
  { name: "gift", Icon: Gift },
  { name: "shield", Icon: Shield },
  { name: "trending-up", Icon: TrendingUp },
] as const;

const DEFAULT_ICONS: Record<Badge["tone"], string> = {
  sale: "percent",
  best: "award",
  new: "sparkles",
  hot: "flame",
  limited: "clock",
};

const POSITIONS = {
  sale: "top-start",
  best: "top-end",
  new: "bottom-start",
  hot: "bottom-end",
  limited: "center",
} as const;

export function getPromoBadgePosition(badge: Pick<Badge, "key" | "tone">) {
  const preset = {
    significant_sale: "sale",
    best_seller: "best",
    new: "new",
    hot: "hot",
    limited: "limited",
  } as const;
  const tone = Object.hasOwn(preset, badge.key)
    ? preset[badge.key as keyof typeof preset]
    : badge.tone;
  return POSITIONS[tone];
}

// Only the decorative plate is shaped; text and icons always remain unclipped.
const SILHOUETTES: Record<Badge["shape"], string> = {
  tag: "M9 1H181L199 24 181 47H9A8 8 0 0 1 1 39V9A8 8 0 0 1 9 1Z",
  burst:
    "M14 1H186L190 5 196 6 196 12 199 17 196 24 199 31 196 36 196 42 190 43 186 47H14L10 43 4 42 4 36 1 31 4 24 1 17 4 12 4 6 10 5Z",
  ticket:
    "M10 1H190A9 9 0 0 1 199 10V17A7 7 0 0 0 199 31V38A9 9 0 0 1 190 47H10A9 9 0 0 1 1 38V31A7 7 0 0 0 1 17V10A9 9 0 0 1 10 1Z",
  ribbon: "M1 1H199L183 24 199 47H1L9 24Z",
  hex: "M19 1H181L199 24 181 47H19L1 24Z",
};

const TONES = {
  sale: styles.toneSale,
  best: styles.toneBest,
  new: styles.toneNew,
  hot: styles.toneHot,
  limited: styles.toneLimited,
};
const SIZES = { sm: styles.sizeSm, md: styles.sizeMd, lg: styles.sizeLg };

export function PromoBadge({
  badge,
  size = "md",
  locale = "en",
  className = "",
}: {
  badge: Badge;
  size?: "sm" | "md" | "lg";
  locale?: "he" | "en";
  className?: string;
}) {
  const { appearanceVersion } = useAnimationSettings();
  if (appearanceVersion === "1")
    return (
      <LegacyPromoBadge
        badge={badge}
        size={size}
        locale={locale}
        className={className}
      />
    );

  const Icon = (
    PROMO_BADGE_ICONS.find((icon) => icon.name === badge.iconName) ??
    PROMO_BADGE_ICONS.find((icon) => icon.name === DEFAULT_ICONS[badge.tone]) ??
    PROMO_BADGE_ICONS[0]
  ).Icon;

  return (
    <span
      className={`sf-promo-badge sf-promo-badge-${badge.tone} ${styles.badge} ${TONES[badge.tone]} ${SIZES[size]} ${className}`}
      data-promo-shape={badge.shape}
      data-promo-position={getPromoBadgePosition(badge)}
      dir={locale === "he" ? "rtl" : "ltr"}
    >
      <svg
        className={styles.silhouette}
        viewBox="0 0 200 48"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d={SILHOUETTES[badge.shape]} vectorEffect="non-scaling-stroke" />
        <path
          className={styles.keyline}
          d={SILHOUETTES[badge.shape]}
          transform="translate(4 4) scale(.96 .833333)"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className={styles.content}>
        <span className={styles.icon} aria-hidden="true">
          <Icon
            size={16}
            strokeWidth={1.8}
            aria-hidden="true"
            focusable="false"
          />
        </span>
        <bdi className={styles.label}>{badge.label}</bdi>
      </span>
    </span>
  );
}

export function StickerCluster({
  badges,
  locale = "en",
  maxVisible = 2,
  className = "",
}: {
  badges: Badge[];
  locale?: "he" | "en";
  maxVisible?: number;
  className?: string;
}) {
  const { appearanceVersion } = useAnimationSettings();
  if (!badges?.length) return null;
  const isRtl = locale === "he";
  const visibleCount = Math.max(0, Math.floor(maxVisible));
  const remainingCount = Math.max(0, badges.length - visibleCount);
  const refined = appearanceVersion === "2";
  const visibleBadges = badges.slice(0, visibleCount);
  const badgeNodes = (items: Badge[]) =>
    items.map((badge) => (
      <PromoBadge key={badge.id} badge={badge} locale={locale} size="sm" />
    ));
  const rows = [
    visibleBadges.filter((badge) =>
      getPromoBadgePosition(badge).startsWith("top-"),
    ),
    visibleBadges.filter((badge) => getPromoBadgePosition(badge) === "center"),
    visibleBadges.filter((badge) =>
      getPromoBadgePosition(badge).startsWith("bottom-"),
    ),
  ];
  const rowNames = ["top", "center", "bottom"];

  return (
    <div
      className={`sf-sticker-cluster ${refined ? styles.cluster : ""} ${className}`}
      dir={isRtl ? "rtl" : "ltr"}
      role="group"
      aria-label={isRtl ? "תגי מבצע" : "Promotional badges"}
    >
      {refined
        ? rows.map((items, index) =>
            items.length ? (
              <div
                className={styles.positionRow}
                data-promo-row={rowNames[index]}
                key={rowNames[index]}
              >
                {badgeNodes(
                  items.sort(
                    (a, b) =>
                      Number(getPromoBadgePosition(a).endsWith("end")) -
                      Number(getPromoBadgePosition(b).endsWith("end")),
                  ),
                )}
              </div>
            ) : null,
          )
        : badgeNodes(visibleBadges)}
      {remainingCount > 0 && (
        <span
          className={`sf-sticker-more ${refined ? styles.more : ""}`}
          aria-label={
            isRtl
              ? `${remainingCount} תגי מבצע נוספים`
              : `${remainingCount} more promotional badges`
          }
        >
          <bdi>+{remainingCount}</bdi>
        </span>
      )}
    </div>
  );
}
