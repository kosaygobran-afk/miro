type DailyPoint = { day: string; events: number };

/** Compare equal UTC-day windows within recorded chart coverage; missing event days count as zero. */
export function summarizeDailyActivity(points: readonly DailyPoint[]) {
  const rows = points
    .filter(
      (point) =>
        /^\d{4}-\d{2}-\d{2}$/.test(point.day) &&
        Number.isFinite(Date.parse(`${point.day}T12:00:00Z`)),
    )
    .map((point) => ({
      ...point,
      events: Math.max(0, Number.isFinite(point.events) ? point.events : 0),
    }))
    .sort((first, second) => first.day.localeCompare(second.day));
  if (!rows.length) return null;
  const start = rows[0].day;
  const end = rows[rows.length - 1].day;
  const firstTime = Date.parse(`${start}T12:00:00Z`);
  const lastTime = Date.parse(`${end}T12:00:00Z`);
  const dayMs = 86_400_000;
  const calendarDays = Math.round((lastTime - firstTime) / dayMs) + 1;
  const total = rows.reduce((sum, point) => sum + point.events, 0);
  const activeDays = new Set(
    rows.filter((point) => point.events > 0).map((point) => point.day),
  ).size;
  const windowDays = Math.floor(calendarDays / 2);
  const earlierEnd = firstTime + (windowDays - 1) * dayMs;
  const recentStart = lastTime - (windowDays - 1) * dayMs;
  const earlierTotal = rows
    .filter((point) => Date.parse(`${point.day}T12:00:00Z`) <= earlierEnd)
    .reduce((sum, point) => sum + point.events, 0);
  const recentTotal = rows
    .filter((point) => Date.parse(`${point.day}T12:00:00Z`) >= recentStart)
    .reduce((sum, point) => sum + point.events, 0);
  const date = (time: number) => new Date(time).toISOString().slice(0, 10);
  return {
    start,
    end,
    calendarDays,
    total,
    activeDays,
    average: total / calendarDays,
    peak: rows.reduce(
      (best, point) => (point.events > best.events ? point : best),
      rows[0],
    ),
    comparison:
      windowDays > 0
        ? {
            windowDays,
            earlier: { from: start, to: date(earlierEnd), total: earlierTotal },
            recent: { from: date(recentStart), to: end, total: recentTotal },
            change:
              earlierTotal > 0
                ? (recentTotal - earlierTotal) / earlierTotal
                : null,
          }
        : null,
  };
}

export function searchCoverage(searches: number, noResults: number) {
  const valid =
    Number.isFinite(searches) &&
    Number.isFinite(noResults) &&
    searches >= 0 &&
    noResults >= 0 &&
    noResults <= searches;
  return {
    valid,
    matched: valid ? searches - noResults : null,
    noResultRate: valid && searches > 0 ? noResults / searches : null,
  };
}

/** Contact events overlap with requests/sessions, so this is only the mix of counted CTA clicks. */
export function contactChannelMix(channels: {
  phone: number;
  whatsapp: number;
  contact: number;
}) {
  // The API projection also carries `total`; count only the three actual channels.
  const entries = (["phone", "whatsapp", "contact"] as const).map((key) => ({
    key,
    count: Math.max(0, channels[key]),
  }));
  const total = entries.reduce((sum, channel) => sum + channel.count, 0);
  const maximum = Math.max(0, ...entries.map((channel) => channel.count));
  return {
    total,
    entries: entries.map((channel) => ({
      ...channel,
      share: total ? channel.count / total : 0,
    })),
    leaders:
      maximum > 0 ? entries.filter((channel) => channel.count === maximum) : [],
  };
}

export function financeRatios(totals: {
  orderCount: number;
  revenueGross: number;
  revenueNet: number;
  grossProfit: number;
  unitsSold: number;
}) {
  return {
    averageOrder:
      totals.orderCount > 0 ? totals.revenueGross / totals.orderCount : null,
    unitsPerOrder:
      totals.orderCount > 0 ? totals.unitsSold / totals.orderCount : null,
    grossMargin:
      totals.revenueNet !== 0 ? totals.grossProfit / totals.revenueNet : null,
  };
}
