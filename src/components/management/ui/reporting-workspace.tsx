"use client";

import type { ReactNode } from "react";
import { Activity, ArrowUpRight, Banknote, Inbox } from "lucide-react";
import Link from "@/components/motion/motion-link";
import { PageHeader } from "./page-header";
import { OverflowText } from "./overflow-text";
import styles from "./reporting-workspace.module.css";

export function ReportingHeader({
  locale,
  section,
  title,
  subtitle,
  actions,
}: {
  locale: "he" | "en";
  section: "requests" | "finance" | "analytics";
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  const he = locale === "he";
  const SectionIcon =
    section === "analytics"
      ? Activity
      : section === "finance"
        ? Banknote
        : Inbox;
  return (
    <div className={styles.hero}>
      <div className={`${styles.eyebrow} insight-workspace-emblem`}>
        <span className="insight-icon" aria-hidden="true">
          <SectionIcon size={20} />
        </span>
        <span>MIRO</span>
        <span className={styles.dot} aria-hidden="true" />
        {he ? "ניהול העסק" : "BUSINESS WORKSPACE"}
      </div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={actions}
        variant="plain"
      />
      <nav
        className={styles.connections}
        aria-label={he ? "סביבת העסק" : "Business workspace"}
      >
        {(
          [
            ["requests", he ? "פניות" : "Requests"],
            ["finance", he ? "כספים" : "Finance"],
            ["analytics", he ? "אנליטיקה" : "Analytics"],
            ["store", he ? "חנות MIRO" : "MIRO store"],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={
              key === "store" ? `/${locale}/store` : `/${locale}/admin/${key}`
            }
            className={styles.connection}
            aria-current={section === key ? "page" : undefined}
          >
            <OverflowText text={label} focusable={false} />
            {key === "store" ? (
              <ArrowUpRight size={14} aria-hidden="true" />
            ) : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function ReportChoices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.choices} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          <OverflowText text={option.label} focusable={false} />
        </button>
      ))}
    </div>
  );
}

export { styles as reportingStyles };
