"use client";

import { createContext } from "react";

export type ManagementToolId = "pos" | "calculator";

export const MANAGEMENT_TOOLS: readonly ManagementToolId[] = [
  "pos",
  "calculator",
];

export interface ManagementToolState {
  id: ManagementToolId;
  open: boolean;
  minimized: boolean;
  /** null = use the window component's default anchor position */
  position: { x: number | null; y: number | null };
  /** Window dimensions */
  size: { width: number; height: number };
  /** Window mode: floating or maximized */
  mode: "floating" | "maximized";
  /** Stored bounds for restore after maximize */
  restoreBounds: { x: number; y: number; width: number; height: number } | null;
  /** Stacking order; higher is above. Managed by the provider. */
  zIndex: number;
}

export interface ManagementToolLabels {
  title: string;
  open: string;
  close: string;
  minimize: string;
  restore: string;
  maximize: string;
  drag: string;
}

export type ManagementToolLocale = "he" | "en";

export const MANAGEMENT_TOOL_LABELS: Record<
  ManagementToolId,
  Record<ManagementToolLocale, ManagementToolLabels>
> = {
  pos: {
    en: {
      title: "POS / Cash Register",
      open: "Open POS",
      close: "Close POS",
      minimize: "Minimize POS",
      restore: "Restore POS",
      maximize: "Maximize POS",
      drag: "Drag POS window",
    },
    he: {
      title: "קופה רושמת",
      open: "פתיחת קופה",
      close: "סגירת קופה",
      minimize: "צמצום קופה",
      restore: "שחזור קופה",
      maximize: "הגדלת קופה",
      drag: "גרירת חלון הקופה",
    },
  },
  calculator: {
    en: {
      title: "Calculator",
      open: "Open calculator",
      close: "Close calculator",
      minimize: "Minimize calculator",
      restore: "Restore calculator",
      maximize: "Maximize calculator",
      drag: "Drag calculator window",
    },
    he: {
      title: "מחשבון",
      open: "פתיחת מחשבון",
      close: "סגירת מחשבון",
      minimize: "צמצום מחשבון",
      restore: "שחזור מחשבון",
      maximize: "הגדלת מחשבון",
      drag: "גרירת חלון המחשבון",
    },
  },
};

export interface ManagementToolsContextShape {
  openTool: (id: ManagementToolId) => void;
  closeTool: (id: ManagementToolId) => void;
  toggleTool: (id: ManagementToolId) => void;
  minimizeTool: (id: ManagementToolId) => void;
  restoreTool: (id: ManagementToolId) => void;
  bringToFront: (id: ManagementToolId) => void;
  setPosition: (
    id: ManagementToolId,
    position: { x: number; y: number },
  ) => void;
  setSize: (
    id: ManagementToolId,
    size: { width: number; height: number },
  ) => void;
  setMode: (id: ManagementToolId, mode: "floating" | "maximized") => void;
  setRestoreBounds: (
    id: ManagementToolId,
    bounds: { x: number; y: number; width: number; height: number } | null,
  ) => void;
  getToolState: (id: ManagementToolId) => ManagementToolState | undefined;
  getLabels: (id: ManagementToolId) => ManagementToolLabels;
  getDraft: (id: ManagementToolId) => unknown;
  saveDraft: (id: ManagementToolId, draft: unknown) => void;
  clearDraft: (id: ManagementToolId) => void;
}

export const ManagementToolsContext =
  createContext<ManagementToolsContextShape | null>(null);
