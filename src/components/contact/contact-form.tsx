"use client";

import { useEffect, useRef, useState } from "react";

export type ContactFormCopy = {
  name: string;
  email: string;
  phone: string;
  message: string;
  company: string;
  submit: string;
  sending: string;
  success: string;
  invalidInput: string;
  rateLimited: string;
  unavailable: string;
  errors: {
    name: string;
    email: string;
    phone: string;
    message: string;
  };
};

type FieldName = "name" | "email" | "phone" | "message";
type FieldErrors = Partial<Record<FieldName, string>>;

interface ContactFormProps {
  locale: "he" | "en";
  copy: ContactFormCopy;
  source: "contact_page" | "product_page" | "store_page";
  productId?: string | null;
  variantId?: string | null;
  contextLine?: string | null;
  initialMessage?: string;
  title?: string;
  intro?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[0-9][0-9()\s.-]{4,24}$/;

export function ContactForm({
  locale,
  copy,
  source,
  productId = null,
  variantId = null,
  contextLine = null,
  initialMessage = "",
  title,
  intro,
}: ContactFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [company, setCompany] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const startedAt = useRef<number>(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);

  // Stamp the render time client-side (after hydration) for the time-trap.
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  // Move keyboard/screen-reader focus to the active feedback region.
  useEffect(() => {
    if (formError) {
      summaryRef.current?.focus();
    }
  }, [formError]);

  useEffect(() => {
    if (success) {
      successRef.current?.focus();
    }
  }, [success]);

  function validate(): boolean {
    const errors: FieldErrors = {};
    if (!name.trim() || name.trim().length > 120)
      errors.name = copy.errors.name;
    if (!EMAIL_PATTERN.test(email.trim()) || email.trim().length > 254) {
      errors.email = copy.errors.email;
    }
    if (phone.trim() && !PHONE_PATTERN.test(phone.trim())) {
      errors.phone = copy.errors.phone;
    }
    if (!message.trim() || message.trim().length > 2000) {
      errors.message = copy.errors.message;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFormError(copy.invalidInput);
      setSuccess(false);
      return false;
    }
    return true;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          message: message.trim(),
          locale,
          source,
          productId: productId ?? undefined,
          variantId: variantId ?? undefined,
          company,
          startedAt: startedAt.current,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        code?: string;
        issues?: string[];
      } | null;

      if (response.ok && data?.ok) {
        setSuccess(true);
        setFormError(null);
        setFieldErrors({});
        setName("");
        setEmail("");
        setPhone("");
        setMessage("");
        setCompany("");
        startedAt.current = Date.now();
        return;
      }

      setSuccess(false);
      if (data?.code === "rate_limited") {
        setFormError(copy.rateLimited);
      } else if (data?.code === "invalid_input") {
        const serverIssues = data.issues ?? [];
        const errors: FieldErrors = {};
        for (const issue of serverIssues) {
          if (issue === "name") errors.name = copy.errors.name;
          if (issue === "email") errors.email = copy.errors.email;
          if (issue === "phone") errors.phone = copy.errors.phone;
          if (issue === "message") errors.message = copy.errors.message;
        }
        if (Object.keys(errors).length > 0) setFieldErrors(errors);
        setFormError(copy.invalidInput);
      } else {
        setFormError(copy.unavailable);
      }
    } catch {
      setSuccess(false);
      setFormError(copy.unavailable);
    } finally {
      setSubmitting(false);
    }
  }

  function fieldProps(field: FieldName) {
    const errorId = `contact-error-${field}`;
    const hasError = Boolean(fieldErrors[field]);
    return {
      "aria-invalid": hasError || undefined,
      "aria-describedby": hasError ? errorId : undefined,
    };
  }

  return (
    <form
      className="miro-card miro-contact-form space-y-4 p-5"
      onSubmit={handleSubmit}
      noValidate
    >
      {title ? (
        <div>
          <h2 className="experience-form-title">{title}</h2>
          {intro ? <p className="experience-form-intro">{intro}</p> : null}
        </div>
      ) : null}

      {contextLine ? (
        <p className="experience-note" dir="auto">
          {contextLine}
        </p>
      ) : null}

      {formError ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="experience-form-status"
          id="contact-error-summary"
        >
          {formError}
        </div>
      ) : null}

      <div className="block">
        <label className="block">
          <span className="mb-2 block font-bold">{copy.name}</span>
          <input
            className="miro-input"
            name="name"
            autoComplete="name"
            maxLength={120}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            {...fieldProps("name")}
          />
        </label>
        {fieldErrors.name ? (
          <p id="contact-error-name" className="experience-form-status">
            {fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className="block">
        <label className="block">
          <span className="mb-2 block font-bold">{copy.email}</span>
          <input
            className="miro-input"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            {...fieldProps("email")}
          />
        </label>
        {fieldErrors.email ? (
          <p id="contact-error-email" className="experience-form-status">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="block">
        <label className="block">
          <span className="mb-2 block font-bold">{copy.phone}</span>
          <input
            className="miro-input"
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={40}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            {...fieldProps("phone")}
          />
        </label>
        {fieldErrors.phone ? (
          <p id="contact-error-phone" className="experience-form-status">
            {fieldErrors.phone}
          </p>
        ) : null}
      </div>

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          insetInlineStart: "-10000px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        <label>
          <span>{copy.company}</span>
          <input
            name="company"
            type="text"
            autoComplete="off"
            tabIndex={-1}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </label>
      </div>

      <div className="block">
        <label className="block">
          <span className="mb-2 block font-bold">{copy.message}</span>
          <textarea
            className="miro-input min-h-32 resize-y"
            name="message"
            maxLength={2000}
            required
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            {...fieldProps("message")}
          />
        </label>
        {fieldErrors.message ? (
          <p id="contact-error-message" className="experience-form-status">
            {fieldErrors.message}
          </p>
        ) : null}
      </div>

      <button
        className="miro-button miro-button-primary w-full"
        type="submit"
        disabled={submitting}
        aria-busy={submitting || undefined}
      >
        {submitting ? copy.sending : copy.submit}
      </button>

      {success ? (
        <p
          ref={successRef}
          tabIndex={-1}
          id="contact-success"
          role="status"
          className="experience-form-status"
        >
          {copy.success}
        </p>
      ) : null}
    </form>
  );
}
