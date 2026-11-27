import Image from "next/image";
import type { ReactNode } from "react";
import type { WebsitePageText } from "@/lib/website-page-copy";
import styles from "./buyer-pages.module.css";

export function BuyerHero({
  copy,
  image,
  fullImage = false,
  headingLevel = 1,
  children,
}: {
  copy: WebsitePageText;
  image: string;
  fullImage?: boolean;
  headingLevel?: 1 | 2;
  children: ReactNode;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <section className={styles.hero} aria-labelledby="buyer-title">
      <div className={styles.heroCopy} data-page-heading-copy>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <Heading id="buyer-title">
          {copy.title} <span>{copy.accent}</span>
          {copy.closing && <> {copy.closing}</>}
        </Heading>
        <p className={styles.intro}>{copy.description}</p>
        <div className={styles.actions}>{children}</div>
      </div>
      {image && (
        <div
          className={styles.heroMedia}
          data-full-image={fullImage || undefined}
        >
          <Image
            src={image}
            alt=""
            fill
            preload={headingLevel === 1}
            sizes="(max-width: 700px) 95vw, 50vw"
            unoptimized={/^https:/i.test(image)}
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </section>
  );
}
