"use client";

import { useEffect, useState } from "react";
import {
  LayoutGrid,
  Maximize,
  Minimize,
  ScanLine,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";
import styles from "./pos-workspace.module.css";

interface PosTopbarProps {
  locale: Locale;
  isFullscreen: boolean;
  onEnterFullscreen: () => Promise<void>;
  onExitFullscreen: () => Promise<void>;
  onHome: () => void;
  homeActive: boolean;
}

export function PosTopbar({
  locale,
  isFullscreen,
  onEnterFullscreen,
  onExitFullscreen,
  onHome,
  homeActive,
}: PosTopbarProps) {
  const he = locale === "he";
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const timer = setTimeout(update, 0);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const connection =
    online === null
      ? he
        ? "בודק חיבור"
        : "Checking connection"
      : online
        ? he
          ? "רשת זמינה"
          : "Network available"
        : he
          ? "אין חיבור — טיוטה בלבד"
          : "Offline — draft only";
  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.brandIcon}>
          <ScanLine size={23} aria-hidden="true" />
        </span>
        <div>
          <h2>
            MIRO <span>{he ? "קופה" : "POS"}</span>
          </h2>
          <small>{he ? "סביבת המכירה שלך" : "Your sales workspace"}</small>
        </div>
      </div>
      <div className={styles.topActions}>
        <div className={styles.status} title={connection}>
          {online === false ? (
            <WifiOff size={16} aria-hidden="true" />
          ) : (
            <Wifi size={16} aria-hidden="true" />
          )}
          <span>{connection}</span>
          <span className="sr-only" role="status">
            {connection}
          </span>
        </div>
        <button
          className={styles.iconButton}
          type="button"
          onClick={onHome}
          aria-pressed={homeActive}
          aria-label={he ? "תפריט הקופה" : "POS menu"}
          title={he ? "תפריט הקופה" : "POS menu"}
        >
          <LayoutGrid size={19} aria-hidden="true" />
        </button>
        <button
          className={styles.iconButton}
          type="button"
          onClick={() =>
            void (isFullscreen ? onExitFullscreen() : onEnterFullscreen())
          }
          aria-pressed={isFullscreen}
          aria-label={
            isFullscreen
              ? he
                ? "יציאה ממסך מלא"
                : "Exit fullscreen"
              : he
                ? "מסך מלא"
                : "Fullscreen"
          }
        >
          {isFullscreen ? (
            <Minimize size={19} aria-hidden="true" />
          ) : (
            <Maximize size={19} aria-hidden="true" />
          )}
        </button>
      </div>
    </header>
  );
}
