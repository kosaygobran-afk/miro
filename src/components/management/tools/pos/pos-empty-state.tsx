"use client";

import { cn } from "./pos-utils";
import type { LucideIcon } from "lucide-react";

interface PosEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function PosEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: PosEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[200px] flex-col items-center justify-center gap-4 px-6 text-center",
      )}
    >
      <div
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-2xl",
          "bg-surface-muted text-muted-foreground/50",
        )}
      >
        <Icon className="h-8 w-8" aria-hidden="true" />
      </div>
      <div>
        <h3 className="text-lg font-medium text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={cn(
            "mt-2 px-4 py-2 rounded-xl font-medium transition-colors",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
          )}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
