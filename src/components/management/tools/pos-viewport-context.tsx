"use client";

import { createContext, useContext } from "react";

export interface PosViewportContextValue {
  enabled: boolean;
  isActive: boolean;
  isNativeFullscreen: boolean;
  fullscreenError: boolean;
  /** Call from a direct user gesture to request native fullscreen when supported. */
  enterFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
}

export const PosViewportContext = createContext<PosViewportContextValue>({
  enabled: false,
  isActive: false,
  isNativeFullscreen: false,
  fullscreenError: false,
  enterFullscreen: async () => undefined,
  exitFullscreen: async () => undefined,
});

/** POS content can observe fullscreen state without coupling to window internals. */
export function usePosViewport() {
  return useContext(PosViewportContext);
}
