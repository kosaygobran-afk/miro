type Locale = "he" | "en";

export const stockCopy = {
  he: {
    inStock: "במלאי",
    outOfStock: "אזל מהמלאי",
    availabilityOnRequest: "זמינות לפי בירור",
  },
  en: {
    inStock: "in stock",
    outOfStock: "Out of stock",
    availabilityOnRequest: "Availability on request",
  },
} as const;

export function StockIndicator({
  quantity,
  locale,
  unconfirmed = false,
  variant = "default",
  tabIndex = 0,
}: {
  quantity: number;
  locale: Locale;
  unconfirmed?: boolean;
  variant?: "default" | "card" | "segment" | "preview";
  tabIndex?: number;
}) {
  const copy = stockCopy[locale];
  if (unconfirmed)
    return (
      <span
        className="sf-availability-pending"
        role={variant === "segment" ? "group" : undefined}
        tabIndex={variant === "segment" ? tabIndex : undefined}
        aria-label={
          variant === "segment" ? copy.availabilityOnRequest : undefined
        }
      >
        {copy.availabilityOnRequest}
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
        ? copy.outOfStock
        : locale === "he"
          ? "נותרו מעט"
          : "Few left",
  }[level];
  const showQuantity = variant !== "preview" || count > 0;
  const label = showQuantity
    ? `${count} ${locale === "he" ? "יחידות במלאי" : "units in stock"} — ${wording}`
    : wording;

  return (
    <span
      className={`sf-stock-indicator sf-stock-indicator--${level}${variant === "card" || variant === "segment" ? " sf-card-stock" : ""}`}
      role="group"
      tabIndex={tabIndex}
      aria-label={label}
      data-tooltip={wording}
    >
      <span className="sf-stock-indicator__light" aria-hidden="true" />
      {showQuantity && (
        <span className="sf-stock-indicator__number" aria-hidden="true">
          {count}
        </span>
      )}
      <span className="sf-stock-indicator__caption" aria-hidden="true">
        {variant !== "default"
          ? count === 0
            ? copy.outOfStock
            : locale === "en" && variant !== "preview"
              ? "In stock"
              : copy.inStock
          : locale === "he"
            ? "נותרו"
            : "left"}
      </span>
    </span>
  );
}
