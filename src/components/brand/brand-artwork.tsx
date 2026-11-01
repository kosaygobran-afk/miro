import artwork from "./artwork.json";
import styles from "./brand.module.css";

/** Fixed vector outlines: Hebrew order never depends on bidi or installed fonts. */
export function BrandArtwork({
  locale = "he",
  compact = false,
}: {
  locale?: "he" | "en";
  compact?: boolean;
}) {
  return (
    <svg
      className={compact ? styles.wordmark : styles.logo}
      viewBox={compact ? artwork.wordmarkViewBox : artwork.viewBox}
      role="img"
      aria-label={locale === "he" ? artwork.name : artwork.englishName}
      data-brand="miro-group"
      xmlns="http://www.w3.org/2000/svg"
    >
      {artwork.wordmark.map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill={path.accent ? artwork.gold : "currentColor"}
          data-brand-accent={path.accent ? path.letter : undefined}
        />
      ))}
      {!compact && (
        <g fill="currentColor">
          {artwork.caption.map((path, index) => (
            <path key={index} d={path.d} transform={path.transform} />
          ))}
        </g>
      )}
    </svg>
  );
}

/** The same mem/yod outlines form the small app/sidebar signature. */
export function BrandMark() {
  return (
    <svg
      className={styles.mark}
      viewBox="1100 10 380 280"
      aria-hidden="true"
      data-brand="miro-group-mark"
    >
      {artwork.wordmark.slice(0, 2).map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill={path.accent ? artwork.gold : "currentColor"}
        />
      ))}
      <circle cx="1178" cy="233" r="25" fill={artwork.gold} />
    </svg>
  );
}
