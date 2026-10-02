"use client";
import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { useStoreDesign } from "./design-context";
import { useReducedMotion } from "./use-reduced-motion";
export function CompanyRail({ locale }: { locale: "he" | "en" }) {
  const { brands } = useStoreDesign();
  const items = brands.items.filter((item) => item.enabled);
  const reduceMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  if (!brands.enabled || !items.length) return null;
  const animated = !reduceMotion && items.length > 2;
  const he = locale === "he";
  const label = he ? "מותגים וטכנולוגיות" : "Brands & technologies";
  return (
    <section className="sf-company-rail" aria-labelledby="company-rail-title">
      <div className="miro-container">
        <div className="sf-company-heading">
          <div>
            <span className="sf-eyebrow">TECHNOLOGY INDEX</span>
            <h2 id="company-rail-title">{label}</h2>
          </div>
          <p>
            {he
              ? "מותגים מוכרים בעולם האבטחה והרשתות"
              : "Recognised names in security and connectivity"}
          </p>
          {animated ? (
            <button
              className="sf-company-toggle"
              type="button"
              aria-label={
                paused
                  ? he
                    ? "הפעלת פס המותגים"
                    : "Play brand rail"
                  : he
                    ? "עצירת פס המותגים"
                    : "Pause brand rail"
              }
              aria-pressed={paused}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          ) : null}
        </div>
        <div
          className="sf-company-viewport"
          data-static={!animated || undefined}
          data-paused={paused || interacting || undefined}
          onMouseEnter={() => setInteracting(true)}
          onMouseLeave={() => setInteracting(false)}
        >
          <div
            className="sf-company-track"
            style={
              {
                "--sf-company-duration": `${brands.durationSeconds}s`,
              } as CSSProperties
            }
          >
            {[false, ...(animated ? [true] : [])].map((duplicate) => (
              <div
                className="sf-company-segment"
                key={String(duplicate)}
                aria-hidden={duplicate || undefined}
              >
                {items.map((item) => (
                  <div className="sf-company-mark" key={item.id}>
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      width={118}
                      height={38}
                      unoptimized
                      onLoad={(event) => {
                        event.currentTarget.hidden = false;
                        event.currentTarget.nextElementSibling?.setAttribute(
                          "hidden",
                          "",
                        );
                      }}
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                        event.currentTarget.nextElementSibling?.removeAttribute(
                          "hidden",
                        );
                      }}
                    />
                    <span hidden>{item.name}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
