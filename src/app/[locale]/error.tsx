"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { endNavigation } from "@/components/motion/navigation-events";

export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = useParams();
  const he = locale === "he";
  useEffect(() => {
    endNavigation();
  }, []);
  return (
    <section
      className="miro-container py-12 motion-content-reveal"
      role="alert"
    >
      <h1 className="text-2xl font-bold">
        {he ? "לא ניתן לטעון את העמוד" : "This page could not load"}
      </h1>
      <p className="my-4">
        {he
          ? "התוכן שלכם נשמר. נסו לטעון שוב."
          : "Please try loading the page again."}
      </p>
      <button className="miro-button miro-button-primary" onClick={reset}>
        {he ? "נסו שוב" : "Try again"}
      </button>
    </section>
  );
}
