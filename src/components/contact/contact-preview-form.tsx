"use client";

import { useState } from "react";

export function ContactPreviewForm({
  labels,
  notice,
  initialMessage = "",
  title,
  intro,
}: {
  labels: {
    name: string;
    email: string;
    phone: string;
    message: string;
    submit: string;
  };
  notice: string;
  initialMessage?: string;
  title?: string;
  intro?: string;
}) {
  const [status, setStatus] = useState(notice);

  return (
    <form
      className="miro-card miro-contact-form space-y-4 p-5"
      aria-describedby="contact-preview-notice"
      onSubmit={(event) => {
        event.preventDefault();
        setStatus(notice);
      }}
    >
      {title ? (
        <div>
          <h2 className="experience-form-title">{title}</h2>
          {intro ? <p className="experience-form-intro">{intro}</p> : null}
        </div>
      ) : null}
      <label className="block">
        <span className="mb-2 block font-bold">{labels.name}</span>
        <input className="miro-input" name="name" autoComplete="name" />
      </label>
      <label className="block">
        <span className="mb-2 block font-bold">{labels.email}</span>
        <input
          className="miro-input"
          name="email"
          type="email"
          autoComplete="email"
        />
      </label>
      <label className="block">
        <span className="mb-2 block font-bold">{labels.phone}</span>
        <input
          className="miro-input"
          name="phone"
          type="tel"
          autoComplete="tel"
        />
      </label>
      <label className="block">
        <span className="mb-2 block font-bold">{labels.message}</span>
        <textarea
          className="miro-input min-h-32 resize-y"
          name="message"
          defaultValue={initialMessage}
        />
      </label>
      <button
        className="miro-button miro-button-primary w-full"
        type="submit"
        disabled
      >
        {labels.submit}
      </button>
      <p
        id="contact-preview-notice"
        role="status"
        className="experience-form-status"
      >
        {status}
      </p>
    </form>
  );
}
