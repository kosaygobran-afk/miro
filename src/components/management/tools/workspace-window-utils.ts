export interface WorkspaceWindowOrder {
  id: string;
  zIndex: number;
}

/** Returns the last rendered window among equal z-indexes, matching paint order. */
export function getFrontmostWorkspaceWindow(
  windows: WorkspaceWindowOrder[],
): string | null {
  let frontmost: WorkspaceWindowOrder | null = null;
  for (const candidate of windows) {
    if (!frontmost || candidate.zIndex >= frontmost.zIndex)
      frontmost = candidate;
  }
  return frontmost?.id ?? null;
}
