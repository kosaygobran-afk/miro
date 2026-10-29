"use client";

import { useRef, useState, type InputHTMLAttributes } from "react";
import { Search, X } from "lucide-react";
import { OverflowText } from "./overflow-text";

type SearchFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value"
> & {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  clearLabel?: string;
};

export function SearchField({
  value,
  onValueChange,
  label,
  clearLabel = "Clear search",
  placeholder = "",
  className,
  onFocus,
  onBlur,
  ...props
}: SearchFieldProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={["mgmt-search-field", className].filter(Boolean).join(" ")}>
      <Search
        className="mgmt-search-field__icon"
        size={18}
        aria-hidden="true"
      />
      <input
        {...props}
        ref={inputRef}
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        data-placeholder-overlay={(!value && !focused) || undefined}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
      {!value && !focused ? (
        <span className="mgmt-search-field__placeholder" aria-hidden="true">
          <OverflowText text={placeholder} focusable={false} />
        </span>
      ) : null}
      {value ? (
        <button
          type="button"
          className="mgmt-search-field__clear"
          aria-label={clearLabel}
          disabled={props.disabled || props.readOnly}
          onClick={() => {
            onValueChange("");
            inputRef.current?.focus();
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
