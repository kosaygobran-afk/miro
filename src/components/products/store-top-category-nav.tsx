import Image from "next/image";
import Link from "@/components/motion/motion-link";
import { getStoreCategoryArtwork } from "@/features/catalog/store-category-artwork";
import type { StorefrontCategoryArtwork } from "@/lib/catalog/storefront-category-artwork";
import type { Locale } from "@/lib/i18n";
import type { StoreCategory } from "@/lib/store-data";
import { StoreTopCategoryGrid } from "./store-top-category-grid";
import styles from "./store-top-category-nav.module.css";

export function StoreTopCategoryNav({
  categories,
  artworkById,
  locale,
}: {
  categories: Pick<StoreCategory, "id" | "key" | "label" | "href">[];
  artworkById: ReadonlyMap<string, StorefrontCategoryArtwork>;
  locale: Locale;
}) {
  if (!categories.length) return null;

  return (
    <nav
      id="store-top-categories"
      className={styles.section}
      aria-labelledby="store-top-category-title"
    >
      <h2
        id="store-top-category-title"
        className={`miro-container sf-eyebrow sf-store-eyebrow ${styles.title}`}
      >
        <span aria-hidden="true" />
        {locale === "he" ? "קטגוריות" : "Categories"}
      </h2>
      <StoreTopCategoryGrid locale={locale}>
        {categories.map(({ id, key, label, href }) => {
          const artwork = artworkById.get(id);
          const illustration = artwork?.iconUrl ?? getStoreCategoryArtwork(key);

          return (
            <Link key={id} href={href} prefetch={false} className={styles.tile}>
              <div className={styles.card}>
                <div className={styles.frame} aria-hidden="true">
                  {artwork?.imageUrl ? (
                    <Image
                      src={artwork.imageUrl}
                      alt=""
                      width={960}
                      height={640}
                      className={styles.photo}
                      unoptimized
                    />
                  ) : (
                    <Image
                      src={illustration}
                      alt=""
                      width={240}
                      height={160}
                      className={styles.illustration}
                      loading="eager"
                      unoptimized
                    />
                  )}
                  {artwork?.imageUrl && artwork.iconUrl && (
                    <Image
                      src={artwork.iconUrl}
                      alt=""
                      width={240}
                      height={160}
                      className={styles.badge}
                      unoptimized
                    />
                  )}
                </div>
                <bdi className={styles.label}>{label}</bdi>
              </div>
            </Link>
          );
        })}
      </StoreTopCategoryGrid>
    </nav>
  );
}
