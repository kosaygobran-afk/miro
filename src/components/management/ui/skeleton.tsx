import type { CSSProperties } from "react";

export type SkeletonProps = {
  /** Width preset or an explicit CSS length. */
  width?: "sm" | "md" | "lg" | "full" | string;
  /** Explicit CSS height; defaults to a text-line height. */
  height?: string;
  /** Circular shape (avatars). */
  circle?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function Skeleton({
  width = "md",
  height,
  circle = false,
  className,
  style,
}: SkeletonProps) {
  const preset = ["sm", "md", "lg", "full"].includes(width);
  const mergedStyle: CSSProperties = {
    ...(preset ? {} : { width }),
    ...(height ? { height } : {}),
    ...style,
  };
  return (
    <span
      aria-hidden="true"
      className={[
        "mgmt-skeleton",
        "mgmt-skeleton--text",
        preset ? `mgmt-skeleton--w-${width}` : null,
        circle ? "mgmt-skeleton--circle" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={mergedStyle}
    />
  );
}

export type ListSkeletonProps = {
  /** Number of placeholder rows. */
  rows?: number;
  /** Render a leading circle per row (avatar-style lists). */
  withAvatar?: boolean;
  className?: string;
};

export function ListSkeleton({
  rows = 5,
  withAvatar = false,
  className,
}: ListSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={["mgmt-list-skeleton", className].filter(Boolean).join(" ")}
    >
      {Array.from({ length: rows }, (_, index) => (
        <div className="mgmt-list-skeleton__row" key={index}>
          {withAvatar ? (
            <span className="mgmt-skeleton mgmt-skeleton--circle mgmt-skeleton--avatar" />
          ) : null}
          <span className="mgmt-skeleton mgmt-skeleton--text mgmt-skeleton--w-full" />
        </div>
      ))}
    </div>
  );
}
