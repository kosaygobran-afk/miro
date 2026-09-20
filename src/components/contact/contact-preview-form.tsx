"use client";

import { useState } from "react";

export function ContactPreviewForm({
  labels,
  notice,
}: {
  labels: { name: string; email: string; phone: string; message: string; submit: string };
  notice: string;
}) {
  const [status, setStatus] = useState(notice);

  return (
    <form
      className="miro-card space-y-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setStatus(notice);
      }}
    >
      <label className="block">
        <span className="mb-2 block font-bold">{labels.name}</span>
        <input className="miro-input" name="name" autoComplete="name" />
      </label>
      <label className="block">
        <span className="mb-2 block font-bold">{labels.email}</span>
        <input className="miro-input" name="email" type="email" autoComplete="email" />
      </label>
      <label className="block">
        <span className="mb-2 block font-bold">{labels.phone}</span>
        <input className="miro-input" name="phone" type="tel" autoComplete="tel" />
      </label>
      <label className="block">
        <span className="mb-2 block font-bold">{labels.message}</span>
        <textarea className="miro-input min-h-32 resize-y" name="message" />
      </label>
      <button className="miro-button miro-button-primary w-full" type="submit">
        {labels.submit}
      </button>
      <p role="status" className="text-sm text-muted-foreground">{status}</p>
    </form>
  );
}
