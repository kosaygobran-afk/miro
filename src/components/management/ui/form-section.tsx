import { useId, type ReactNode } from "react";

export type FormSectionProps = {
  /** Section heading. */
  title: ReactNode;
  icon?: ReactNode;
  sectionId?: string;
  /** Supporting description line. */
  description?: ReactNode;
  /** Optional trailing actions aligned with the heading. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Grouped area of a settings/edit page rendered as a labelled <section>.
 */
export function FormSection({
  title,
  icon,
  sectionId,
  description,
  actions,
  children,
  className,
}: FormSectionProps) {
  const headingId = useId();
  return (
    <section
      id={sectionId}
      aria-labelledby={headingId}
      className={["mgmt-form-section", className].filter(Boolean).join(" ")}
    >
      <div className="mgmt-form-section__header">
        <div className="mgmt-form-section__heading">
          {icon ? (
            <span className="mgmt-section-icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <div className="mgmt-form-section__text">
            <h2 id={headingId} className="mgmt-form-section__title">
              {title}
            </h2>
            {description ? (
              <p className="mgmt-form-section__description">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="mgmt-form-section__actions">{actions}</div>
        ) : null}
      </div>
      <div className="mgmt-form-section__body">{children}</div>
    </section>
  );
}
