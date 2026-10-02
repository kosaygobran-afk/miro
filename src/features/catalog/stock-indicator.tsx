type Locale = "he" | "en";

export function StockIndicator({
  quantity,
  locale,
  unconfirmed = false,
}: {
  quantity: number;
  locale: Locale;
  unconfirmed?: boolean;
}) {
  if (unconfirmed)
    return (
      <span className="sf-availability-pending">
        {locale === "he" ? "זמינות לפי בירור" : "Availability on request"}
      </span>
    );
  const count = Math.max(0, Math.floor(quantity));
  const level =
    count >= 15
      ? "abundant"
      : count >= 6
        ? "available"
        : count >= 4
          ? "limited"
          : "critical";
  const wording = {
    abundant: locale === "he" ? "זמינות גבוהה" : "Plenty available",
    available: locale === "he" ? "זמין במלאי" : "In stock",
    limited: locale === "he" ? "מלאי מוגבל" : "Limited stock",
    critical:
      count === 0
        ? locale === "he"
          ? "אזל מהמלאי"
          : "Out of stock"
        : locale === "he"
          ? "נותרו מעט"
          : "Few left",
  }[level];
  const label = `${count} ${locale === "he" ? "יחידות במלאי" : "units in stock"} — ${wording}`;

  return (
    <span
      className={`sf-stock-indicator sf-stock-indicator--${level}`}
      role="group"
      tabIndex={0}
      aria-label={label}
      data-tooltip={wording}
    >
      <span className="sf-stock-indicator__light" aria-hidden="true" />
      <span className="sf-stock-indicator__number" aria-hidden="true">
        {count}
      </span>
      <span className="sf-stock-indicator__caption" aria-hidden="true">
        {locale === "he" ? "נותרו" : "left"}
      </span>
    </span>
  );
}
