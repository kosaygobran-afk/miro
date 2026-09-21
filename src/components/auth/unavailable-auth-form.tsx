"use client";

import { useState } from "react";

export function UnavailableAuthForm({
  fields,
  submitLabel,
  notice,
}: {
  fields: Array<{ name: string; label: string; type: string }>;
  submitLabel: string;
  notice: string;
}) {
  const [message, setMessage] = useState(notice);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(notice);
      }}
    >
      {fields.map((field) => (
        <label key={field.name} className="block">
          <span className="mb-2 block font-bold text-foreground">
            {field.label}
          </span>
          <input
            className="miro-input"
            type={field.type}
            name={field.name}
            autoComplete={
              field.type === "password" ? "current-password" : field.name
            }
          />
        </label>
      ))}
      <button
        type="submit"
        className="miro-button miro-button-primary w-full"
        aria-describedby="auth-unavailable"
      >
        {submitLabel}
      </button>
      <p
        id="auth-unavailable"
        role="status"
        className="rounded-lg border border-border-subtle bg-surface-muted p-3 text-sm text-muted-foreground"
      >
        {message}
      </p>
    </form>
  );
}
