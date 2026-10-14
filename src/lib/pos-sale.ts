export type PosSaleInput = {
  source?: unknown;
  [key: string]: unknown;
};

export function sanitizePosSaleBody(input: unknown): unknown {
  if (!input || typeof input !== "object") {
    return input;
  }

  const rest = { ...(input as PosSaleInput) };
  delete (rest as Record<string, unknown>).source;
  return rest;
}
