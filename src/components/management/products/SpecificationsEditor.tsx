"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";

type SpecEntry = { key: string; value: string };

export function SpecificationsEditor({
  locale,
  initialSpecs,
  onChange,
  disabled,
}: {
  locale: "he" | "en";
  initialSpecs: Record<string, unknown>;
  onChange: (specs: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const he = locale === "he";
  const [specs, setSpecs] = useState<SpecEntry[]>(() => {
    const entries = Object.entries(initialSpecs ?? {}).map(([key, value]) => ({
      key,
      value: String(value ?? ""),
    }));
    return entries.length > 0 ? entries : [{ key: "", value: "" }];
  });

  const syncToParent = useCallback(() => {
    const obj: Record<string, unknown> = {};
    specs.forEach((s) => {
      if (s.key.trim()) {
        obj[s.key.trim()] = s.value;
      }
    });
    onChange(obj);
  }, [specs, onChange]);

  useEffect(() => {
    syncToParent();
  }, [specs, syncToParent]);

  const addRow = () => {
    setSpecs((prev) => [...prev, { key: "", value: "" }]);
  };

  const removeRow = (index: number) => {
    setSpecs((prev) => prev.filter((_, i) => i !== index));
  };

  const updateKey = (index: number, key: string) => {
    setSpecs((prev) => prev.map((s, i) => (i === index ? { ...s, key } : s)));
  };

  const updateValue = (index: number, value: string) => {
    setSpecs((prev) => prev.map((s, i) => (i === index ? { ...s, value } : s)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium">
          {he ? "מפרט טכני" : "Specifications"}
        </label>
        {!disabled && (
          <button
            type="button"
            className="miro-button miro-button-secondary text-sm"
            onClick={addRow}
            aria-label={he ? "הוסף שורה" : "Add row"}
          >
            <Plus className="mr-1 h-4 w-4" />
            {he ? "הוסף שדה" : "Add field"}
          </button>
        )}
      </div>

      <div
        className="grid gap-3"
        role="list"
        aria-label={he ? "מפרט טכני" : "Specifications"}
      >
        {specs.map((spec, index) => (
          <div
            key={`${index}-${spec.key}`}
            className="flex items-center gap-2 miro-card p-3"
            role="listitem"
          >
            <GripVertical
              className="h-5 w-5 text-muted-foreground cursor-grab"
              aria-hidden="true"
            />
            <input
              type="text"
              value={spec.key}
              onChange={(e) => updateKey(index, e.target.value)}
              className="miro-input flex-1 min-w-0"
              placeholder={he ? "מפתח (למשל: משקל)" : "Key (e.g., Weight)"}
              disabled={disabled}
              aria-label={he ? "מפתח" : "Key"}
            />
            <span className="text-muted-foreground">:</span>
            <input
              type="text"
              value={spec.value}
              onChange={(e) => updateValue(index, e.target.value)}
              className="miro-input flex-1 min-w-0"
              placeholder={he ? "ערך (למשל: 2.5 ק״ג)" : "Value (e.g., 2.5 kg)"}
              disabled={disabled}
              aria-label={he ? "ערך" : "Value"}
            />
            {!disabled && (
              <button
                type="button"
                className="miro-button miro-button-secondary text-sm text-destructive p-2"
                onClick={() => removeRow(index)}
                aria-label={he ? "הסר שדה" : "Remove field"}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {specs.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {he
            ? "אין שדות מפרט. לחץ על 'הוסף שדה' כדי להתחיל."
            : "No specification fields. Click 'Add field' to start."}
        </p>
      )}
    </div>
  );
}
