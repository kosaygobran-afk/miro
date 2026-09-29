type DailyMetricRow = {
  day: string | null;
  event_type: string | null;
  events: number | null;
};

/** The view has one row per product/day/type; counts must be added, not replaced.
 * Distinct sessions/users cannot be summed across products and are omitted. */
export function aggregateDailyEvents(rows: DailyMetricRow[]) {
  const result: Record<string, Record<string, { events: number }>> = {};
  for (const row of rows) {
    const day = row.day?.split("T")[0];
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const type = row.event_type ?? "unknown";
    result[day] ??= {};
    result[day][type] ??= { events: 0 };
    result[day][type].events += row.events ?? 0;
  }
  return result;
}
