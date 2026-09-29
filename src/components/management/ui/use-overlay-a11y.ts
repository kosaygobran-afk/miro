"use client";

import { useOverlayA11y } from "./overlay-stack";

/**
 * Re-export of the shared overlay accessibility hook.
 * The implementation lives in overlay-stack.tsx to ensure single source of truth
 * for overlay coordination, focus management, and portal rendering.
 */
export { useOverlayA11y };
export type { UseOverlayOptions } from "./overlay-stack";