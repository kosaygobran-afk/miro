"use client";

import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import type { Locale } from "@/lib/i18n";

/**
 * Date-range presets. Semantics:
 * - "today": from = to = today.
 * - "last7": rolling window, from = today − 6 days, to = today.
 * - "week": THIS CALENDAR week, Sunday → Saturday (Israeli locale week).
 * - "month": current calendar month, 1st → last day.
 * - "custom": explicit from/to entered by the user.
 */
export type DateRangePreset = "today" | "last7" | "week" | "month" | "custom";

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
  const today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
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
  const presetText: Record<Exclude<DateRangePreset, "custom">, string> = {
    today: labels.today,
    last7: labels.last7,
    week: labels.week,
    month: labels.month,
  };

  const selectPreset = (preset: DateRangePreset) => {
    if (preset === "custom") {
      onChange({ preset, from: value.from, to: value.to });
      return;
    }
    const range = resolveDateRange(preset);
    onChange({ preset, from: range.from, to: range.to });
  };

  return (
    <div
      className={["mgmt-date-range", className].filter(Boolean).join(" ")}
      role="group"
      aria-label={labels.groupLabel}
    >
      <div className="mgmt-date-range__presets">
        <CalendarDays
          size={16}
          aria-hidden="true"
          className="mgmt-date-range__icon"
        />
        {presetOrder.map((preset) => (
          <button
            key={preset}
            type="button"
            className={[
              "mgmt-date-range__preset",
              value.preset === preset
                ? "mgmt-date-range__preset--active"
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={value.preset === preset}
            onClick={() => selectPreset(preset)}
          >
            {presetText[preset]}
          </button>
        ))}
        <button
          type="button"
          className={[
            "mgmt-date-range__preset",
            value.preset === "custom"
              ? "mgmt-date-range__preset--active"
              : null,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-pressed={value.preset === "custom"}
          onClick={() => selectPreset("custom")}
        >
          {labels.custom}
        </button>
      </div>
      {value.preset === "custom" ? (
        <div className="mgmt-date-range__custom">
          <label className="mgmt-date-range__field">
            <span className="mgmt-date-range__field-label">
              {labels.fromLabel}
            </span>
            <input
              type="date"
              className="mgmt-date-range__input"
              value={value.from}
              max={value.to || undefined}
              onChange={(event) =>
                onChange({ ...value, from: event.target.value })
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
              value={value.to}
              min={value.from || undefined}
              onChange={(event) =>
                onChange({ ...value, to: event.target.value })
              }
            />
          </label>
        </div>
      ) : null}
      {trailing ? (
        <div className="mgmt-date-range__trailing">{trailing}</div>
      ) : null}
    </div>
  );
}
