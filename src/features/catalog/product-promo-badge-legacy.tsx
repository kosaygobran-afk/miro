"use client";

import type { PromoBadge } from "@/features/catalog/product-data";

// Badge type definitions
type BadgeType = "significant_sale" | "best_seller" | "new" | "hot" | "limited";

const PRESET_ICONS: Record<BadgeType, string> = {
  significant_sale: "percent",
  best_seller: "award",
  new: "sparkles",
  hot: "flame",
  limited: "clock",
};

interface PromoBadgeProps {
  badge: PromoBadge;
  size?: "sm" | "md" | "lg";
  locale?: "he" | "en";
  className?: string;
}

// SVG icon functions - these return JSX elements directly
function renderPercentIcon({
  size = 14,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="19" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <path d="M5 5l14 14" />
    </svg>
  );
}

function renderAwardIcon({
  size = 14,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function renderSparklesIcon({
  size = 14,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v2m0 14v2m9-9h-2M4 12H2m15.07-7.93l-1.41 1.41M8.48 16.58l-1.41 1.41M16.58 8.48l1.41-1.41M8.48 7.42l-1.41-1.41" />
    </svg>
  );
}

function renderFlameIcon({
  size = 14,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

function renderClockIcon({
  size = 14,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

// Map icon names to render functions
const ICON_RENDERERS: Record<
  string,
  (props: { size?: number; color?: string }) => React.ReactElement
> = {
  percent: renderPercentIcon,
  award: renderAwardIcon,
  sparkles: renderSparklesIcon,
  flame: renderFlameIcon,
  clock: renderClockIcon,
};

function getBadgeShapeStyles(
  shape: string,
  size: "sm" | "md" | "lg",
  isRtl: boolean,
) {
  const sizeMap = {
    sm: {
      fontSize: "0.55rem",
      padding: "0.15rem 0.4rem",
      iconSize: 10,
      gap: "0.2rem",
    },
    md: {
      fontSize: "0.65rem",
      padding: "0.2rem 0.5rem",
      iconSize: 12,
      gap: "0.25rem",
    },
    lg: {
      fontSize: "0.75rem",
      padding: "0.3rem 0.7rem",
      iconSize: 14,
      gap: "0.35rem",
    },
  };

  const s = sizeMap[size];

  switch (shape) {
    case "tag":
      // Diagonal tag shape (-7deg LTR, mirror RTL)
      return {
        base: {
          display: "inline-flex",
          alignItems: "center",
          gap: s.gap,
          fontSize: s.fontSize,
          fontWeight: 800,
          letterSpacing: "0.02em",
          lineHeight: 1,
          padding: s.padding,
          borderRadius: size === "sm" ? "3px" : "4px",
          clipPath: isRtl
            ? "polygon(12% 0, 100% 0, 100% 100%, 0 100%)"
            : "polygon(0 0, 88% 0, 100% 100%, 0 100%)",
          transform: isRtl ? "skewX(7deg)" : "skewX(-7deg)",
        },
        inner: {
          transform: isRtl ? "skewX(-7deg)" : "skewX(7deg)",
          display: "flex",
          alignItems: "center",
          gap: s.gap,
        },
      };

    case "burst":
      // Starburst shape
      return {
        base: {
          display: "inline-flex",
          alignItems: "center",
          gap: s.gap,
          fontSize: s.fontSize,
          fontWeight: 800,
          letterSpacing: "0.02em",
          lineHeight: 1,
          padding: `${s.padding} ${size === "sm" ? "0.5rem" : size === "md" ? "0.65rem" : "0.85rem"}`,
          borderRadius: size === "sm" ? "16px" : "20px",
          clipPath:
            size === "sm"
              ? "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)"
              : size === "md"
                ? "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)"
                : "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
        },
        inner: { display: "flex", alignItems: "center", gap: s.gap },
      };

    case "ticket":
      // Ticket shape with notches
      return {
        base: {
          display: "inline-flex",
          alignItems: "center",
          gap: s.gap,
          fontSize: s.fontSize,
          fontWeight: 800,
          letterSpacing: "0.02em",
          lineHeight: 1,
          padding: s.padding,
          borderRadius: "6px",
          position: "relative" as const,
          overflow: "hidden",
        },
        inner: { display: "flex", alignItems: "center", gap: s.gap },
      };

    case "ribbon":
      // Ribbon shape with folded end
      return {
        base: {
          display: "inline-flex",
          alignItems: "center",
          gap: s.gap,
          fontSize: s.fontSize,
          fontWeight: 800,
          letterSpacing: "0.02em",
          lineHeight: 1,
          padding: `${s.padding} ${size === "sm" ? "0.55rem" : size === "md" ? "0.7rem" : "0.9rem"}`,
          borderRadius: "0 4px 4px 0",
          position: "relative" as const,
        },
        inner: { display: "flex", alignItems: "center", gap: s.gap },
      };

    case "hex":
      // Hexagon shape
      return {
        base: {
          display: "inline-flex",
          alignItems: "center",
          gap: s.gap,
          fontSize: s.fontSize,
          fontWeight: 800,
          letterSpacing: "0.02em",
          lineHeight: 1,
          padding: `${s.padding} ${size === "sm" ? "0.7rem" : size === "md" ? "0.9rem" : "1.1rem"}`,
          clipPath:
            "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
        },
        inner: { display: "flex", alignItems: "center", gap: s.gap },
      };

    default:
      return {
        base: {
          display: "inline-flex",
          alignItems: "center",
          gap: s.gap,
          fontSize: s.fontSize,
          fontWeight: 800,
          padding: s.padding,
          borderRadius: "4px",
        },
        inner: { display: "flex", alignItems: "center", gap: s.gap },
      };
  }
}

export function LegacyPromoBadge({
  badge,
  size = "md",
  locale = "en",
  className = "",
}: PromoBadgeProps) {
  const isRtl = locale === "he";
  const presetIcon = PRESET_ICONS[badge.key as BadgeType] ?? "percent";
  const shapeStyles = getBadgeShapeStyles(badge.shape, size, isRtl);
  const renderIcon =
    ICON_RENDERERS[badge.iconName ?? presetIcon] ?? renderPercentIcon;
  const iconSize = size === "sm" ? 10 : size === "md" ? 12 : 14;

  // For tag shape, we need a special render with SVG background + HTML text
  if (badge.shape === "tag") {
    const isSale = badge.tone === "sale";
    const percentMatch = badge.label.match(/(\d+)%/);
    const percentValue = percentMatch ? percentMatch[1] : null;

    return (
      <span
        className={`sf-promo-badge sf-promo-badge-${badge.tone} sf-promo-badge-${badge.shape} ${className}`}
        style={
          {
            ...shapeStyles.base,
            background: "var(--promo-fill)",
            color: "var(--promo-ink)",
          } as React.CSSProperties
        }
        aria-label={badge.label}
      >
        <span style={shapeStyles.inner as React.CSSProperties}>
          {percentValue && isSale ? (
            <>
              <svg
                width={iconSize}
                height={iconSize}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              >
                <circle cx="19" cy="5" r="2" />
                <circle cx="5" cy="19" r="2" />
                <path d="M5 5l14 14" />
              </svg>
              <span
                style={{
                  fontSize:
                    size === "sm"
                      ? "0.55rem"
                      : size === "md"
                        ? "0.65rem"
                        : "0.75rem",
                }}
              >
                -{percentValue}%
              </span>
            </>
          ) : (
            <>
              {renderIcon({ size: iconSize })}
              <span>{badge.label}</span>
            </>
          )}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`sf-promo-badge sf-promo-badge-${badge.tone} sf-promo-badge-${badge.shape} ${className}`}
      style={
        {
          ...shapeStyles.base,
          background: "var(--promo-fill)",
          color: "var(--promo-ink)",
        } as React.CSSProperties
      }
      aria-label={badge.label}
    >
      <span style={shapeStyles.inner as React.CSSProperties}>
        {renderIcon({ size: iconSize })}
        <span>{badge.label}</span>
      </span>
    </span>
  );
}
