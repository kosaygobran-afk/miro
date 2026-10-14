"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  MANAGEMENT_TOOLS,
  MANAGEMENT_TOOL_LABELS,
  ManagementToolsContext,
  type ManagementToolId,
  type ManagementToolLabels,
  type ManagementToolLocale,
  type ManagementToolState,
  type ManagementToolsContextShape,
} from "./tool-types";
import { FloatingToolWindows } from "./floating-tool-windows";

export const TOOL_STORAGE_KEY_PREFIX = "miro.management.tools.";

export const TOOL_BASE_Z_INDEX = 80; // layer: page content < topbar overlays < floating tools (80+) < modals (>=120)

function defaultToolState(id: ManagementToolId): ManagementToolState {
  const defaultSize =
    id === "pos"
      ? { width: 72 * 16, height: 42 * 16 }
      : { width: 26 * 16, height: 42 * 16 };

  return {
    id,
    open: false,
    minimized: false,
    position: { x: null, y: null },
    size: defaultSize,
    mode: "floating",
    restoreBounds: null,
    zIndex: TOOL_BASE_Z_INDEX,
  };
}

function defaultStates(): Record<ManagementToolId, ManagementToolState> {
  return {
    pos: defaultToolState("pos"),
    calculator: defaultToolState("calculator"),
  };
}

function loadForUser(
  userId: string,
): Record<ManagementToolId, ManagementToolState> {
  const states = defaultStates();
  if (typeof window === "undefined") return states;
  try {
    const stored = window.localStorage.getItem(
      TOOL_STORAGE_KEY_PREFIX + userId,
    );
    if (!stored) return states;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) return states;
    const record = parsed as Record<string, unknown>;
    for (const id of MANAGEMENT_TOOLS) {
      const defaultSize =
        id === "pos"
          ? { width: 72 * 16, height: 42 * 16 }
          : { width: 26 * 16, height: 42 * 16 };
      const raw = record[id];
      if (typeof raw !== "object" || raw === null) continue;
      const entry = raw as Record<string, unknown>;
      const position =
        typeof entry.position === "object" && entry.position !== null
          ? (entry.position as Record<string, unknown>)
          : undefined;
      const size =
        typeof entry.size === "object" && entry.size !== null
          ? (entry.size as Record<string, unknown>)
          : undefined;
      const restoreBounds =
        typeof entry.restoreBounds === "object" && entry.restoreBounds !== null
          ? (entry.restoreBounds as Record<string, unknown>)
          : undefined;
      states[id] = {
        id,
        open: entry.open === true,
        minimized: entry.minimized === true,
        position: {
          x: typeof position?.x === "number" ? position.x : null,
          y: typeof position?.y === "number" ? position.y : null,
        },
        size: {
          width:
            typeof size?.width === "number" ? size.width : defaultSize.width,
          height:
            typeof size?.height === "number" ? size.height : defaultSize.height,
        },
        mode:
          entry.mode === "floating" || entry.mode === "maximized"
            ? entry.mode
            : "floating",
        restoreBounds: restoreBounds
          ? {
              x: typeof restoreBounds.x === "number" ? restoreBounds.x : 0,
              y: typeof restoreBounds.y === "number" ? restoreBounds.y : 0,
              width:
                typeof restoreBounds.width === "number"
                  ? restoreBounds.width
                  : defaultSize.width,
              height:
                typeof restoreBounds.height === "number"
                  ? restoreBounds.height
                  : defaultSize.height,
            }
          : null,
        zIndex:
          typeof entry.zIndex === "number"
            ? Math.max(entry.zIndex, TOOL_BASE_Z_INDEX)
            : TOOL_BASE_Z_INDEX,
      };
    }
  } catch {
    // Corrupted storage — fall back to defaults.
  }
  return states;
}

interface ManagementToolProviderProps {
  userId: string;
  locale: ManagementToolLocale;
  children: ReactNode;
}

/**
 * Hosts the persistent floating management tools (POS, calculator).
 * Mounted once inside ManagementShell, so window open state, position and
 * tool content survive normal /admin/* navigation. Positions persist per user
 * in localStorage; switching users reloads that user's layout only.
 */
export function ManagementToolProvider({
  userId,
  locale,
  children,
}: ManagementToolProviderProps) {
  const [toolStates, setToolStates] =
    useState<Record<ManagementToolId, ManagementToolState>>(defaultStates);
  const hydratedForRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted layout on mount and whenever the signed-in user changes.
  // Deferred a frame so it never runs synchronously during render, which keeps
  // the server-rendered output (all tools closed) identical to the first
  // client render and avoids hydration mismatches.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      // A user action (including a payment return) can open a tool before
      // this frame. Do not overwrite that action with the saved layout.
      if (hydratedForRef.current === userId) return;
      hydratedForRef.current = userId;
      setToolStates(loadForUser(userId));
    });
    return () => cancelAnimationFrame(frame);
  }, [userId]);

  // Debounced persistence; never writes before the user's layout was loaded.
  useEffect(() => {
    if (hydratedForRef.current !== userId) return undefined;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const snapshot = toolStates;
    saveTimerRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(
          TOOL_STORAGE_KEY_PREFIX + userId,
          JSON.stringify(snapshot),
        );
      } catch {
        // Storage may be unavailable (private mode); layout simply won't persist.
      }
    }, 400);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [toolStates, userId]);

  const updateToolState = useCallback(
    (
      id: ManagementToolId,
      update:
        | Partial<ManagementToolState>
        | ((state: ManagementToolState) => Partial<ManagementToolState>),
    ) => {
      const initial =
        hydratedForRef.current === userId ? null : loadForUser(userId);
      hydratedForRef.current = userId;
      setToolStates((prev) => {
        const current = initial ?? prev;
        const patch =
          typeof update === "function" ? update(current[id]) : update;
        return { ...current, [id]: { ...current[id], ...patch } };
      });
    },
    [userId],
  );

  const openTool = useCallback(
    (id: ManagementToolId) =>
      updateToolState(id, { open: true, minimized: false }),
    [updateToolState],
  );

  const closeTool = useCallback(
    (id: ManagementToolId) => updateToolState(id, { open: false }),
    [updateToolState],
  );

  const toggleTool = useCallback(
    (id: ManagementToolId) =>
      updateToolState(id, (state) => ({
        open: !state.open,
        minimized: !state.open ? false : state.minimized,
      })),
    [updateToolState],
  );

  const minimizeTool = useCallback(
    (id: ManagementToolId) => updateToolState(id, { minimized: true }),
    [updateToolState],
  );

  const restoreTool = useCallback(
    (id: ManagementToolId) => updateToolState(id, { minimized: false }),
    [updateToolState],
  );

  const bringToFront = useCallback((id: ManagementToolId) => {
    setToolStates((prev) => {
      const maxZ = Math.max(
        ...MANAGEMENT_TOOLS.map((toolId) => prev[toolId].zIndex),
      );
      // Renormalize zIndex if it grows too large (base + 50)
      if (maxZ > TOOL_BASE_Z_INDEX + 50) {
        const offset = prev[id].zIndex - TOOL_BASE_Z_INDEX;
        return {
          ...prev,
          [id]: {
            ...prev[id],
            zIndex: TOOL_BASE_Z_INDEX + offset,
          },
        };
      }
      if (prev[id].zIndex > maxZ) return prev;
      return { ...prev, [id]: { ...prev[id], zIndex: maxZ + 1 } };
    });
  }, []);

  const setPosition = useCallback(
    (id: ManagementToolId, position: { x: number; y: number }) =>
      updateToolState(id, { position }),
    [updateToolState],
  );

  const setSize = useCallback(
    (id: ManagementToolId, size: { width: number; height: number }) =>
      updateToolState(id, { size }),
    [updateToolState],
  );

  const setMode = useCallback(
    (id: ManagementToolId, mode: "floating" | "maximized") =>
      updateToolState(id, { mode }),
    [updateToolState],
  );

  const setRestoreBounds = useCallback(
    (
      id: ManagementToolId,
      bounds: { x: number; y: number; width: number; height: number } | null,
    ) => updateToolState(id, { restoreBounds: bounds }),
    [updateToolState],
  );

  const getToolState = useCallback(
    (id: ManagementToolId) => toolStates[id],
    [toolStates],
  );

  const getLabels = useCallback(
    (id: ManagementToolId): ManagementToolLabels =>
      MANAGEMENT_TOOL_LABELS[id][locale],
    [locale],
  );

  const getDraft = useCallback(
    (id: ManagementToolId) => {
      if (typeof window === "undefined") return null;
      try {
        const key = `${TOOL_STORAGE_KEY_PREFIX}draft.${userId}.${id}`;
        const stored = window.sessionStorage.getItem(key);
        if (!stored) return null;
        return JSON.parse(stored);
      } catch {
        return null;
      }
    },
    [userId],
  );

  const saveDraft = useCallback(
    (id: ManagementToolId, draft: unknown) => {
      if (typeof window === "undefined") return;
      if (document.documentElement.dataset.managementSigningOut === "true")
        return;
      try {
        const key = `${TOOL_STORAGE_KEY_PREFIX}draft.${userId}.${id}`;
        window.sessionStorage.setItem(key, JSON.stringify(draft));
      } catch {
        // Session storage may be unavailable (private mode); draft simply won't persist.
      }
    },
    [userId],
  );

  const clearDraft = useCallback(
    (id: ManagementToolId) => {
      if (typeof window === "undefined") return;
      try {
        const key = `${TOOL_STORAGE_KEY_PREFIX}draft.${userId}.${id}`;
        window.sessionStorage.removeItem(key);
      } catch {
        // Session storage may be unavailable; ignore.
      }
    },
    [userId],
  );

  const contextValue: ManagementToolsContextShape = useMemo(
    () => ({
      openTool,
      closeTool,
      toggleTool,
      minimizeTool,
      restoreTool,
      bringToFront,
      setPosition,
      setSize,
      setMode,
      setRestoreBounds,
      getToolState,
      getLabels,
      getDraft,
      saveDraft,
      clearDraft,
    }),
    [
      openTool,
      closeTool,
      toggleTool,
      minimizeTool,
      restoreTool,
      bringToFront,
      setPosition,
      setSize,
      setMode,
      setRestoreBounds,
      getToolState,
      getLabels,
      getDraft,
      saveDraft,
      clearDraft,
    ],
  );

  return (
    <ManagementToolsContext.Provider value={contextValue}>
      {children}
      <FloatingToolWindows
        locale={locale}
        getLabels={getLabels}
        userId={userId}
      />
    </ManagementToolsContext.Provider>
  );
}

export function useManagementTools(): ManagementToolsContextShape {
  const ctx = useContext(ManagementToolsContext);
  if (!ctx) {
    throw new Error(
      "useManagementTools must be used inside <ManagementToolProvider>",
    );
  }
  return ctx;
}
