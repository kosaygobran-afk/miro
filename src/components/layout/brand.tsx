import styles from "@/components/brand/brand.module.css";
import { BrandArtwork, BrandMark } from "@/components/brand/brand-artwork";

export function Brand({ locale = "he" }: { locale?: "he" | "en" }) {
  return (
    <span className="premium-brand">
      <BrandArtwork locale={locale} />
      <span className={styles.mobileMark}>
        <BrandMark />
      </span>
    </span>
  );
}
