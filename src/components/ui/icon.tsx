"use client";

import { forwardRef, type SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  children?: React.ReactNode;
}

export const Icon = forwardRef<SVGSVGElement, IconProps>(
  ({ children, ...props }, ref) => {
    return (
      <svg ref={ref} suppressHydrationWarning {...props}>
        {children}
      </svg>
    );
  },
);

Icon.displayName = "Icon";
