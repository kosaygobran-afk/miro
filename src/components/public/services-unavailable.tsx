"use client";

import { useTransition } from "react";
import { useRouter } from "@/components/motion/use-motion-router";

export function ServicesUnavailable({
  locale,
  detail = false,
}: {
  locale: "he" | "en";
  detail?: boolean;
}) {
  const he = locale === "he";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const Heading = detail ? "h1" : "h2";
  return (
    <div className="miro-container">
      <div className="sf-empty miro-card p-6" role="status" aria-live="polite">
        <Heading>
          {he
            ? "השירותים אינם זמינים כרגע"
            : "Services are temporarily unavailable"}
        </Heading>
        <p>
          {he
            ? "לא הצלחנו לטעון את פרטי השירותים. נסו שוב בעוד רגע."
            : "We could not load the service information. Please try again shortly."}
        </p>
        <button
          type="button"
          className="miro-button miro-button-secondary"
          disabled={pending}
          aria-busy={pending}
          onClick={() => startTransition(() => router.refresh())}
        >
          {pending
            ? he
              ? "מנסה שוב…"
              : "Trying again…"
            : he
              ? "נסו שוב"
              : "Try again"}
        </button>
      </div>
    </div>
  );
}
