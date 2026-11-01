/** Display-only price typography. The catalog still supplies the resolved price. */
export function PriceAmount({
  amount,
  locale,
}: {
  amount: number;
  locale: "he" | "en";
}) {
  const number = new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    maximumFractionDigits: 0,
  }).format(amount);
  return (
    <bdi className="sf-money" dir="ltr">
      <span className="sf-money-currency">₪</span>
      <span className="sf-money-number">{number}</span>
    </bdi>
  );
}

export function DiscountBadge({
  percent,
  locale,
  className,
}: {
  percent: number;
  locale: "he" | "en";
  className: string;
}) {
  return (
    <span
      className={className}
      dir="ltr"
      aria-label={locale === "he" ? `${percent}% הנחה` : `${percent}% off`}
    >
      <bdi dir="ltr">−{percent}%</bdi>
    </span>
  );
}
