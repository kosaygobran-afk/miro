import { z } from "zod";

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  });
const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,79}$/);
export const auditFiltersSchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    action: identifier.optional(),
    entityType: identifier.optional(),
    userId: z.uuid().optional(),
    entityId: z.uuid().optional(),
    from: day.optional(),
    to: day.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(50000).default(0),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "Invalid date range",
  });

/** Calendar dates represent business days in Israel, including DST changes. */
export function israelDayStart(day: string, followingDay = false): string {
  const target = new Date(`${day}T00:00:00Z`);
  if (followingDay) target.setUTCDate(target.getUTCDate() + 1);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let candidate = target.getTime();
  for (let step = 0; step < 3; step++) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .map(({ type, value }) => [type, value]),
    );
    const wallTime = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    candidate += target.getTime() - wallTime;
  }
  return new Date(candidate).toISOString();
}

/** Quote the PostgREST pattern so punctuation cannot introduce another filter. */
export function auditSearchExpression(search: string): string {
  const pattern = `%${search.replace(/[\\%_*]/g, (character) => `\\${character}`)}%`;
  const quoted = `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const clauses = ["action", "entity_type", "details->>slug"].map(
    (column) => `${column}.ilike.${quoted}`,
  );
  if (z.uuid().safeParse(search).success)
    clauses.push(`entity_id.eq.${search}`, `user_id.eq.${search}`);
  return clauses.join(",");
}
