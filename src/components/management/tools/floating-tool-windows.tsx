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
            position={state.position}
            zIndex={state.zIndex}
            labels={labels}
            onMinimize={() => minimizeTool(id)}
            onRestore={() => restoreTool(id)}
            onClose={() => closeTool(id)}
            onPositionChange={(position) => setPosition(id, position)}
            onActivate={() => bringToFront(id)}
          >
            {Content ? (
              <Content locale={locale} userId={userId} />
            ) : (
              <p data-tool-placeholder={id}>{labels.title}</p>
            )}
          </FloatingWorkspaceWindow>
        );
      })}
    </>
  );
}
