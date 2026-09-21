export function Brand({ locale = "he" }: { locale?: "he" | "en" }) {
  return (
    <span className="premium-brand">
      <svg
        className="premium-brand-symbol"
        viewBox="0 0 48 54"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M24 2 45 13v28L32 49V20l-8-4-8 4v29L3 41V13L24 2Z"
          fill="currentColor"
        />
        <path d="M20 23h8v17h-8z" fill="var(--primary)" />
        <path d="M20 44h8v8h-8z" fill="currentColor" />
      </svg>
      <span className="premium-brand-type">
        <span className="premium-brand-name">
          {locale === "he" ? "מירו" : "MIRO"}
          <span className="premium-brand-dot">.</span>
        </span>
        <span className="premium-brand-caption">
          {locale === "he"
            ? "מערכות מיגון ותקשורת"
            : "SECURITY & COMMUNICATIONS"}
        </span>
      </span>
    </span>
  );
}
