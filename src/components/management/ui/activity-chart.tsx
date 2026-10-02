import styles from "./activity-chart.module.css";

type Series = {
  label: string;
  values: number[];
  tone: "gold" | "teal" | "cyan" | "violet";
};

/** Daily aggregates: retain exact values in a keyboard-accessible data table. */
export function ActivityChart({
  days,
  series,
  locale,
  unit,
  note,
  kind = "bar",
}: {
  days: string[];
  series: Series[];
  locale: "en" | "he";
  unit: string;
  note: string;
  kind?: "bar" | "line";
}) {
  const he = locale === "he";
  const number = new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
    maximumFractionDigits: 2,
  });
  const maximum = Math.max(
    1,
    ...series.flatMap((item) => item.values.map(Math.abs)),
  );
  const step = Math.max(1, 10 ** Math.floor(Math.log10(maximum)) / 2);
  const tickStep = Math.max(1, Math.ceil(maximum / 4 / step) * step);
  const ceiling = tickStep * 4;
  const hasNegative = series.some((item) =>
    item.values.some((value) => value < 0),
  );
  const floor = hasNegative ? -ceiling : 0;
  const y = (value: number) =>
    220 - ((value - floor) / (ceiling - floor)) * 190;
  const width = Math.max(640, days.length * 64 + 76);
  const slot = (width - 84) / Math.max(1, days.length);
  const date = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(he ? "he-IL" : "en-IL", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
  return (
    <div className={styles.root}>
      <div className={styles.legend}>
        <span>{unit}</span>
        {series.map((item) => (
          <span key={item.label}>
            <i className={styles[item.tone]} />
            {item.label}
          </span>
        ))}
      </div>
      <div
        className={styles.scroll}
        dir="ltr"
        tabIndex={0}
        role="region"
        aria-label={he ? "תרשים יומי, ניתן לגלילה" : "Daily chart, scrollable"}
      >
        <svg
          viewBox={`0 0 ${width} 260`}
          style={{ minWidth: width }}
          className={styles.chart}
          role="img"
          aria-label={`${unit}. ${note}`}
        >
          {[0, 1, 2, 3, 4].map((tick) => {
            const value = floor + ((ceiling - floor) * tick) / 4;
            return (
              <g key={tick}>
                <line
                  x1="68"
                  x2={width - 8}
                  y1={y(value)}
                  y2={y(value)}
                  className={styles.grid}
                />
                <text x="58" y={y(value) + 4} textAnchor="end">
                  {number.format(value)}
                </text>
              </g>
            );
          })}
          {kind === "line"
            ? series.map((item) => (
                <polyline
                  key={item.label}
                  fill="none"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className={`${styles[item.tone]} ${styles.line}`}
                  points={days
                    .map(
                      (_, index) =>
                        `${76 + index * slot + slot / 2},${y(item.values[index] ?? 0)}`,
                    )
                    .join(" ")}
                />
              ))
            : null}
          {days.map((day, index) => (
            <g key={day}>
              {series.map((item, seriesIndex) => {
                const value = item.values[index] ?? 0;
                const barWidth = Math.min(24, slot / (series.length + 1));
                return kind === "line" ? (
                  <circle
                    key={item.label}
                    cx={76 + index * slot + slot / 2}
                    cy={y(value)}
                    r="4"
                    className={styles[item.tone]}
                  >
                    <title>
                      {date(day)} · {item.label}: {number.format(value)}
                    </title>
                  </circle>
                ) : (
                  <rect
                    key={item.label}
                    x={
                      76 +
                      index * slot +
                      slot / 2 +
                      (seriesIndex - series.length / 2) * barWidth
                    }
                    y={Math.min(y(value), y(0))}
                    width={barWidth - 3}
                    height={Math.abs(y(value) - y(0))}
                    rx="3"
                    className={styles[item.tone]}
                  >
                    <title>
                      {date(day)} · {item.label}: {number.format(value)}
                    </title>
                  </rect>
                );
              })}
              <text
                x={76 + index * slot + slot / 2}
                y="246"
                textAnchor="middle"
              >
                {date(day)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p className={styles.note}>{note}</p>
      <details className={styles.details}>
        <summary>
          {he ? "הצגת הנתונים המדויקים לפי יום" : "View exact daily figures"}
        </summary>
        <div className={styles.scroll}>
          <table>
            <caption className="mgmt-visually-hidden">{unit}</caption>
            <thead>
              <tr>
                <th scope="col">{he ? "תאריך" : "Date"}</th>
                {series.map((item) => (
                  <th scope="col" key={item.label}>
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day, index) => (
                <tr key={day}>
                  <th scope="row">
                    <time dateTime={day}>{date(day)}</time>
                  </th>
                  {series.map((item) => (
                    <td key={item.label}>
                      {number.format(item.values[index] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
