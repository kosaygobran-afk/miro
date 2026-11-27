import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { getMessages, type Locale } from "@/lib/i18n";
import type { PublishedService } from "@/lib/public-services";
import { serviceGuide } from "./service-guide-copy";
import styles from "./buyer-pages.module.css";

export function ServiceDirectory({
  services,
  overrides,
  locale,
}: {
  services: PublishedService[];
  overrides: Record<string, string>;
  locale: Locale;
}) {
  const he = locale === "he";
  const seedDescriptions = getMessages(locale).pages.services.categories;

  return (
    <div className={styles.directory}>
      {services.map((service) => {
        const { guide, Icon } = serviceGuide(service);
        const name = service[`name_${locale}`];
        const short = service[`short_description_${locale}`]?.trim();
        const seeded = seedDescriptions.find(({ id }) => id === service.slug);
        const description = service[`description_${locale}`]?.trim();
        const summary =
          short && short !== seeded?.description
            ? short
            : description || guide?.[locale][0];
        const notesLabel = he ? "פרטים לקראת הפנייה" : "Project notes";
        const preparation = guide?.[locale][1];
        const photo = overrides[`service-${service.id}`] ?? service.image_url;
        const features =
          service.content.features
            ?.map((item) => item[`text_${locale}`].trim())
            .filter(Boolean) ?? [];
        const steps =
          service.content.process_steps?.filter(
            (item) =>
              item[`title_${locale}`].trim() || item[`text_${locale}`].trim(),
          ) ?? [];
        const questions =
          service.content.faq?.filter(
            (item) =>
              item[`question_${locale}`].trim() &&
              item[`answer_${locale}`].trim(),
          ) ?? [];
        const hasNotes = Boolean(
          preparation ||
          photo ||
          features.length ||
          steps.length ||
          questions.length,
        );

        return (
          <article
            className={styles.service}
            key={service.id}
            data-service-entry
            data-headline-group
          >
            <div className={styles.serviceHeading}>
              <span className="experience-icon" data-headline-icon>
                <Icon aria-hidden="true" />
              </span>
              <h3>{name}</h3>
            </div>
            {summary && <p>{summary}</p>}
            {description && description !== summary && <p>{description}</p>}
            {hasNotes && (
              <details className={styles.notes}>
                <summary aria-label={`${notesLabel} · ${name}`}>
                  {notesLabel}
                  <ChevronDown size={17} aria-hidden="true" />
                </summary>
                <div>
                  {preparation && <p>{preparation}</p>}
                  {features.length > 0 && (
                    <ul>
                      {features.map((feature, i) => (
                        <li key={i}>{feature}</li>
                      ))}
                    </ul>
                  )}
                  {steps.length > 0 && (
                    <ol>
                      {steps.map((step, i) => (
                        <li key={i}>
                          <strong>{step[`title_${locale}`]}</strong>{" "}
                          {step[`text_${locale}`]}
                        </li>
                      ))}
                    </ol>
                  )}
                  {questions.map((faq, i) => (
                    <div key={i}>
                      <h4>{faq[`question_${locale}`]}</h4>
                      <p>{faq[`answer_${locale}`]}</p>
                    </div>
                  ))}
                  {photo && (
                    <Image
                      src={photo}
                      width={480}
                      height={280}
                      alt=""
                      sizes="(max-width: 700px) 90vw, 30vw"
                      unoptimized={/^https:/i.test(photo)}
                      referrerPolicy="no-referrer"
                      className={styles.servicePhoto}
                    />
                  )}
                </div>
              </details>
            )}
          </article>
        );
      })}
    </div>
  );
}
