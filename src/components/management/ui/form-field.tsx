import { useId, type ReactNode } from "react";

export type FormFieldControlProps = {
  /** Stable control id — wire it to the input/select/textarea `id`. */
  id: string;
  required?: boolean;
  /** Set when `error` is present; wire to the control. */
  "aria-invalid"?: true | undefined;
  /** References the description and error elements; wire to the control. */
  "aria-describedby"?: string | undefined;
  /** Marks the control as disabled. */
  disabled?: boolean;
};

export type FormFieldProps = {
  /** Visible label; wired to the control with `htmlFor`. */
  label: ReactNode;
  /** Error message; marks the control invalid and is announced via role="alert". */
  error?: ReactNode;
  /** Helper text rendered under the control. */
  description?: ReactNode;
  /** Marks the field as required (visual marker + control `required` prop). */
  required?: boolean;
  /** Marks the field as disabled (label styling + control `disabled` prop). */
  disabled?: boolean;
  /** Explicit control id; a stable generated id is used when omitted. */
  id?: string;
  className?: string;
  /** Render-prop: receives the wired control props to spread on the input. */
  children: (control: FormFieldControlProps) => ReactNode;
};

/**
 * Labelled form control wrapper: stable id, htmlFor, required marker and
 * aria-invalid / aria-describedby wiring for description and error text.
 */
export function FormField({
  label,
  error,
  description,
  required = false,
  disabled = false,
  id,
  className,
  children,
}: FormFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const descriptionId = `${fieldId}-description`;
  const errorId = `${fieldId}-error`;
  const describedBy =
    [description ? descriptionId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={["w-full", className].filter(Boolean).join(" ")}>
      <label
        htmlFor={fieldId}
        className={[
          "mb-1 block text-sm font-medium",
          disabled && "text-muted-foreground/60",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {label}
        {required ? (
          <span className="ms-1 text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children({
        id: fieldId,
        required,
        disabled,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {description ? (
        <p id={descriptionId} className="mt-1 text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
