"use client";

import type { ComponentType } from "react";
import { useManagementTools } from "./management-tool-provider";
import {
  MANAGEMENT_TOOLS,
  type ManagementToolId,
  type ManagementToolLabels,
  type ManagementToolLocale,
} from "./tool-types";
import { FloatingWorkspaceWindow } from "./floating-workspace-window";
import { PosWindow as PosToolContent } from "./pos/pos-window";
import { CalculatorWindow as CalculatorToolContent } from "./calculator/calculator-window";

/**
 * Single integration point for floating management tools.
 *
 * Tool content components register here by adding a static import plus an
 * entry in TOOL_CONTENT below, e.g.
 *   import { PosToolContent } from "./pos/pos-window";
 *   ...
 *   pos: PosToolContent,
 *
 * Content components receive `{ locale }`. Everything else (open/minimize/
 * drag persistence, layering) is owned by the provider — do not modify
 * management-tool-provider.tsx or shell files to add a tool.
 */
export interface ManagementToolContentProps {
  locale: ManagementToolLocale;
  userId: string;
}

const TOOL_CONTENT: Record<
  ManagementToolId,
  ComponentType<ManagementToolContentProps> | null
> = {
  pos: PosToolContent,
  calculator: CalculatorToolContent,
};

export function FloatingToolWindows({
  locale,
  userId,
  getLabels,
}: {
  locale: ManagementToolLocale;
  userId: string;
  getLabels: (id: ManagementToolId) => ManagementToolLabels;
}) {
  const {
    closeTool,
    minimizeTool,
    restoreTool,
    setPosition,
    setSize,
    setMode,
    setRestoreBounds,
    bringToFront,
    getToolState,
  } = useManagementTools();

  return (
    <>
      {MANAGEMENT_TOOLS.map((id) => {
        const state = getToolState(id);
        if (!state?.open) return null;
        const labels = getLabels(id);
        const Content = TOOL_CONTENT[id];
        return (
          <FloatingWorkspaceWindow
            key={id}
            title={labels.title}
            open={state.open}
            minimized={state.minimized}
            mode={state.mode}
            position={state.position}
            size={state.size}
            restoreBounds={state.restoreBounds}
            zIndex={state.zIndex}
            labels={{
              ...labels,
              maximize:
                labels.maximize ?? (id === "pos" ? "Maximize" : "Maximize"),
              restore: labels.restore ?? (id === "pos" ? "Restore" : "Restore"),
              resize: "Resize",
              enterFullscreen:
                locale === "he" ? "מעבר למסך מלא" : "Enter fullscreen",
              exitFullscreen:
                locale === "he" ? "יציאה ממסך מלא" : "Exit fullscreen",
              fullscreenFallback:
                locale === "he"
                  ? "תצוגה מקצה לקצה בחלון הדפדפן"
                  : "Edge-to-edge browser viewport",
              fullscreenError:
                locale === "he"
                  ? "הדפדפן לא אפשר מסך מלא. הופעלה תצוגה מקצה לקצה."
                  : "Native fullscreen is unavailable. Edge-to-edge view is active.",
            }}
            viewportModeEnabled={id === "pos"}
            presentation={id === "pos" ? "workspace" : "utility"}
            onMinimize={() => minimizeTool(id)}
            onRestore={() => restoreTool(id)}
            onMaximize={() =>
              setMode(id, state.mode === "maximized" ? "floating" : "maximized")
            }
            onClose={() => closeTool(id)}
            onPositionChange={(position) => setPosition(id, position)}
            onSizeChange={(size) => setSize(id, size)}
            onModeChange={(mode) => setMode(id, mode)}
            onRestoreBoundsChange={(bounds) => setRestoreBounds(id, bounds)}
            onActivate={() => bringToFront(id)}
          >
            {Content ? (
              <Content key={userId} locale={locale} userId={userId} />
            ) : (
              <p data-tool-placeholder={id}>{labels.title}</p>
            )}
          </FloatingWorkspaceWindow>
        );
      })}
    </>
  );
}
