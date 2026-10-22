"use client";

import { useTransition } from "react";
import { useRouter } from "@/components/motion/use-motion-router";
import { storeCopy } from "@/features/catalog/store-copy";

/** A failed read must not look like an empty catalog or a missing product. */
export function CatalogUnavailable({ locale }: { locale: "he" | "en" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const copy = storeCopy[locale];

  return (
    <div className="sf-storefront">
      <section className="sf-collection-section">
        <div className="miro-container">
          <div className="sf-empty" role="status" aria-live="polite">
            <h1>{copy.catalogUnavailable}</h1>
            <p>{copy.catalogUnavailableText}</p>
            <button
              type="button"
              className="miro-button miro-button-secondary"
              disabled={pending}
              aria-busy={pending}
              onClick={() => startTransition(() => router.refresh())}
            >
              {pending ? copy.catalogRetrying : copy.catalogRetry}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
