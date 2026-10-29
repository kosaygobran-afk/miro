"use client";

import Link from "@/components/motion/motion-link";
import { useParams } from "next/navigation";

export default function NotFound() {
  const he = useParams().locale === "he";

  return (
    <section className="miro-container py-12 motion-content-reveal">
      <div className="miro-page-panel miro-page-panel-narrow">
        <p aria-hidden="true">404</p>
        <h1 className="text-2xl font-bold">
          {he ? "העמוד לא נמצא" : "Page not found"}
        </h1>
        <p className="my-4">
          {he
            ? "העמוד שחיפשתם אינו זמין. אפשר לחזור לחנות ולהמשיך לגלוש."
            : "The page you requested is unavailable. Return to the store to keep browsing."}
        </p>
        <Link
          className="miro-button miro-button-primary"
          href={he ? "/he" : "/en"}
        >
          {he ? "חזרה לחנות" : "Back to the store"}
        </Link>
      </div>
    </section>
  );
}
