"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "./dialog";
import { CalendarDays, ChevronDown } from "lucide-react";
import type { Locale } from "@/lib/i18n";

/**
 * Date-range presets. Semantics:
 * - "today": from = to = today.
 * - "last7": rolling window, from = today − 6 days, to = today.
 * - "week": THIS CALENDAR week, Sunday → Saturday (Israeli locale week).
 * - "month": current calendar month, 1st → last day.
 * - "all": no date filter (all time).
 * - "custom": explicit from/to entered by the user.
 */
export type DateRangePreset =
  "today" | "last7" | "week" | "month" | "all" | "custom";

/** Inclusive range as ISO date strings (yyyy-mm-dd, local dates). */
export type DateRangeValue = {
  preset: DateRangePreset;
  from: string;
  to: string;
};

export type DateRangeLabels = {
  groupLabel: string;
  today: string;
  last7: string;
  week: string;
  month: string;
  all: string;
  custom: string;
  fromLabel: string;
  toLabel: string;
};

export function dateRangeLabels(locale: Locale): DateRangeLabels {
  return locale === "he"
    ? {
        groupLabel: "טווח תאריכים",
        today: "היום",
        last7: "7 הימים האחרונים",
        week: "השבוע",
        month: "החודש",
        all: "הכל",
        custom: "מותאם אישית",
        fromLabel: "מתאריך",
        toLabel: "עד תאריך",
      }
    : {
        groupLabel: "Date range",
        today: "Today",
        last7: "Last 7 days",
        week: "This week",
        month: "This month",
        all: "All",
        custom: "Custom",
        fromLabel: "From",
        toLabel: "To",
      };
}

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Resolves a preset to concrete local dates (inclusive). */
export function resolveDateRange(
  preset: Exclude<DateRangePreset, "custom">,
  base: Date = new Date(),
): { from: string; to: string } {
  if (preset === "all") return { from: "", to: "" };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(base)
      .map(({ type, value }) => [type, value]),
  );
  const today = new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
  );
  if (preset === "today") {
    const day = toISODate(today);
    return { from: day, to: day };
  }
  if (preset === "last7") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from: toISODate(from), to: toISODate(today) };
  }
  if (preset === "week") {
    // Calendar week starting Sunday (day 0), ending Saturday.
    const from = new Date(today);
    from.setDate(from.getDate() - from.getDay());
    const to = new Date(from);
    to.setDate(to.getDate() + 6);
    return { from: toISODate(from), to: toISODate(to) };
  }
  // month
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: toISODate(from), to: toISODate(to) };
}

export type DateRangePickerProps = {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  /**
   * Localized labels. Defaults to English; use dateRangeLabels(locale) for
   * Hebrew wiring when messages keys are not yet available.
   */
  labels?: DateRangeLabels;
  /** Extra content rendered after the preset row. */
  trailing?: ReactNode;
  className?: string;
};

const presetOrder: readonly Exclude<DateRangePreset, "custom">[] = [
  "today",
  "last7",
  "week",
  "month",
  "all",
];

/**
 * Lite date-range picker: preset segmented buttons plus custom from/to date
 * inputs when the "custom" preset is active. Preset selection immediately
 * resolves to concrete inclusive dates via onChange.
 */
export function DateRangePicker({
  value,
  onChange,
  labels = dateRangeLabels("en"),
  trailing,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const he = labels.fromLabel !== "From";
  const presetText: Record<Exclude<DateRangePreset, "custom">, string> = {
    today: labels.today,
    last7: labels.last7,
    week: labels.week,
    month: labels.month,
    all: labels.all,
  };

  const selectPreset = (preset: DateRangePreset) => {
    if (preset === "custom") {
      onChange({ preset, from: value.from, to: value.to });
      return;
    }
    if (preset === "all") {
      // Clear date range - no filter
      onChange({ preset, from: "", to: "" });
      return;
    }
    const range = resolveDateRange(preset);
    onChange({ preset, from: range.from, to: range.to });
  };

  const summary =
    value.preset === "custom"
      ? [value.from, value.to].filter(Boolean).join(" — ") || labels.custom
      : presetText[value.preset];
  return (
    <div className={["mgmt-date-range", className].filter(Boolean).join(" ")}>
      <button
        type="button"
        className="mgmt-date-range__trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays size={18} aria-hidden="true" />
        <span className="mgmt-date-range__trigger-text">
          <span>{labels.groupLabel}</span>
          <strong>{summary}</strong>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={labels.groupLabel}
        size="sm"
        closeLabel={he ? "סגירה" : "Close"}
        footer={
          <button
            type="button"
            className="mgmt-button mgmt-button--primary"
            onClick={() => setOpen(false)}
          >
            {he ? "סיום" : "Done"}
          </button>
        }
      >
        <div
          className="mgmt-date-range__presets"
          role="group"
          aria-label={labels.groupLabel}
        >
          {presetOrder.map((preset) => (
            <button
              key={preset}
              type="button"
              className="mgmt-date-range__preset"
              aria-pressed={value.preset === preset}
              onClick={() => {
                selectPreset(preset);
                setOpen(false);
              }}
            >
              {presetText[preset]}
            </button>
          ))}
          <button
            type="button"
            className="mgmt-date-range__preset"
            aria-pressed={value.preset === "custom"}
            onClick={() => selectPreset("custom")}
          >
            {labels.custom}
          </button>
        </div>
        <div className="mgmt-date-range__custom">
          <label className="mgmt-date-range__field">
            <span className="mgmt-date-range__field-label">
              {labels.fromLabel}
            </span>
            <input
              type="date"
              className="mgmt-date-range__input"
              dir="ltr"
              value={value.from}
              max={value.to || undefined}
              onChange={(event) =>
                onChange({
                  preset: "custom",
                  from: event.target.value,
                  to: value.to,
                })
              }
            />
          </label>
          <label className="mgmt-date-range__field">
            <span className="mgmt-date-range__field-label">
              {labels.toLabel}
            </span>
            <input
              type="date"
              className="mgmt-date-range__input"
              dir="ltr"
              value={value.to}
              min={value.from || undefined}
              onChange={(event) =>
                onChange({
                  preset: "custom",
                  from: value.from,
                  to: event.target.value,
                })
              }
            />
          </label>
        </div>
      </Dialog>
      {trailing ? (
        <div className="mgmt-date-range__trailing">{trailing}</div>
      ) : null}
    </div>
  );
}
