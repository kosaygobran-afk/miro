import { israelDayStart } from "./management-audit";

/** Reporting controls use inclusive Israel business days, regardless of browser zone. */
export function reportingRangeParams(range: { from: string; to: string }) {
  const params = new URLSearchParams();
  if (range.from) params.set("from", israelDayStart(range.from));
  if (range.to) {
    params.set(
      "to",
      new Date(
        new Date(israelDayStart(range.to, true)).getTime() - 1,
      ).toISOString(),
    );
  }
  return params;
}

/** A zero baseline cannot yield a meaningful percentage comparison. */
export function periodChange(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / Math.abs(previous);
}
