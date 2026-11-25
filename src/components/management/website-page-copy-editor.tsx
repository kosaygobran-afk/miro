"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileText, RotateCcw, Save } from "lucide-react";
import {
  defaultWebsitePageCopy,
  websitePageCopySchema,
  websitePageFieldLimits,
  websitePageKeys,
  type WebsitePageCopy,
  type WebsitePageKey,
  type WebsitePageText,
} from "@/lib/website-page-copy";
import type { Locale } from "@/lib/i18n";
import { ErrorState, FormField, FormSection, FormSkeleton, Notice } from "./ui";

const endpoint = "/api/management/settings/page-copy";
const pageLabels = {
  store: { en: "Store", he: "חנות" },
  home: { en: "Home", he: "בית" },
  services: { en: "Services overview", he: "סקירת שירותים" },
  about: { en: "About", he: "אודות" },
  contact: { en: "Contact", he: "יצירת קשר" },
} satisfies Record<WebsitePageKey, Record<Locale, string>>;

const fieldLabels = {
  eyebrow: { en: "Small heading", he: "כותרת מקדימה" },
  title: { en: "Main heading", he: "כותרת ראשית" },
  accent: { en: "Highlighted heading", he: "כותרת מודגשת" },
  closing: { en: "Third heading line", he: "שורת כותרת שלישית" },
  description: { en: "Introduction", he: "טקסט פתיחה" },
} satisfies Record<keyof WebsitePageText, Record<Locale, string>>;

const fields = Object.keys(fieldLabels) as (keyof WebsitePageText)[];

type SavedCopy = { copy: WebsitePageCopy; revision: string };
type Message = { tone: "danger" | "success"; text: string };

async function readResponse(response: Response): Promise<SavedCopy> {
  const data = await response.json();
  if (!response.ok || typeof data.revision !== "string")
    throw new Error("read_failed");
  return {
    copy: websitePageCopySchema.parse(data.copy),
    revision: data.revision,
  };
}

export function WebsitePageCopyEditor({
  locale,
  canEdit,
}: {
  locale: Locale;
  canEdit: boolean;
}) {
  const he = locale === "he";
  const [page, setPage] = useState<WebsitePageKey>("store");
  const [saved, setSaved] = useState<SavedCopy | null>(null);
  const [draft, setDraft] = useState<WebsitePageCopy>({});
  const [attempt, setAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const publishInFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, {
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
    })
      .then(readResponse)
      .then((result) => {
        if (controller.signal.aborted) return;
        setSaved(result);
        setDraft(result.copy);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, [attempt]);

  function reload() {
    setSaved(null);
    setLoadFailed(false);
    setNeedsReload(false);
    setMessage(null);
    setAttempt((current) => current + 1);
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !saved || publishInFlight.current || needsReload) return;
    const parsed = websitePageCopySchema.safeParse(draft);
    if (!parsed.success) {
      setMessage({
        tone: "danger",
        text: he
          ? "יש למלא את כל השדות בשתי השפות ולהסיר ירידות שורה."
          : "Complete each field in both languages and remove any line breaks.",
      });
      return;
    }
    publishInFlight.current = true;
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ copy: parsed.data, revision: saved.revision }),
      });
      if (response.status === 409) {
        setNeedsReload(true);
        setMessage({
          tone: "danger",
          text: he
            ? "הטקסט השתנה מאז פתיחת העורך. טענו את הגרסה השמורה לפני פרסום."
            : "The saved text changed while you were editing. Reload it before publishing.",
        });
        return;
      }
      const result = await readResponse(response);
      setSaved(result);
      setDraft(result.copy);
      setMessage({
        tone: "success",
        text: he ? "הטקסט פורסם באתר." : "Page text published.",
      });
    } catch {
      setNeedsReload(true);
      setMessage({
        tone: "danger",
        text: he
          ? "הפרסום לא אומת. טענו את הטקסט השמור כדי לבדוק מה פורסם."
          : "Publication could not be confirmed. Reload the saved text to check what was published.",
      });
    } finally {
      publishInFlight.current = false;
      setSubmitting(false);
    }
  }

  const pageText: Record<Locale, WebsitePageText> =
    draft[page] ?? defaultWebsitePageCopy[page];
  const changedPages = saved
    ? websitePageKeys.filter(
        (key) => JSON.stringify(draft[key]) !== JSON.stringify(saved.copy[key]),
      )
    : [];
  const dirty = changedPages.length > 0;

  return (
    <FormSection
      title={he ? "טקסטי פתיחה" : "Page headings and introductions"}
      icon={<FileText size={20} />}
      description={
        he
          ? "בחרו עמוד וערכו את הכותרות ואת הפתיחה בעברית ובאנגלית."
          : "Choose a page to edit its opening headings and introduction in Hebrew and English."
      }
    >
      {loadFailed ? (
        <ErrorState
          title={
            he
              ? "לא ניתן לטעון את הטקסט השמור"
              : "Saved page text could not be loaded"
          }
          onRetry={reload}
          retryLabel={he ? "ניסיון חוזר" : "Retry"}
        />
      ) : !saved ? (
        <FormSkeleton />
      ) : (
        <form onSubmit={publish} className="min-w-0 space-y-5">
          {!canEdit ? (
            <Notice>
              {he
                ? "פרסום טקסט בעמודים זמין למנכ״ל."
                : "The CEO can publish page text."}
            </Notice>
          ) : null}
          <FormField label={he ? "עמוד באתר" : "Website page"}>
            {(control) => (
              <select
                {...control}
                className="mgmt-select"
                value={page}
                disabled={submitting}
                onChange={(event) =>
                  setPage(event.target.value as WebsitePageKey)
                }
              >
                {websitePageKeys.map((key) => (
                  <option key={key} value={key}>
                    {pageLabels[key][locale]}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <div className="grid min-w-0 gap-5 lg:grid-cols-2">
            {([locale, he ? "en" : "he"] as const).map((language) => (
              <fieldset key={language} className="min-w-0 space-y-4">
                <legend className="font-semibold">
                  {language === "he"
                    ? he
                      ? "עברית"
                      : "Hebrew"
                    : he
                      ? "אנגלית"
                      : "English"}
                </legend>
                {fields
                  .filter((field) => field !== "closing" || page === "home")
                  .map((field) => (
                    <FormField
                      key={field}
                      label={fieldLabels[field][locale]}
                      disabled={submitting}
                    >
                      {(control) => {
                        const inputProps = {
                          ...control,
                          className: "mgmt-input w-full",
                          lang: language,
                          dir: language === "he" ? "rtl" : "ltr",
                          maxLength: websitePageFieldLimits[field],
                          value:
                            pageText[language][field] ??
                            defaultWebsitePageCopy[page][language][field] ??
                            "",
                          readOnly: !canEdit,
                          onChange: (
                            event: React.ChangeEvent<
                              HTMLInputElement | HTMLTextAreaElement
                            >,
                          ) => {
                            const value = event.target.value;
                            setDraft((current) => {
                              const currentPage =
                                current[page] ?? defaultWebsitePageCopy[page];
                              return {
                                ...current,
                                [page]: {
                                  ...currentPage,
                                  [language]: {
                                    ...currentPage[language],
                                    [field]: value,
                                  },
                                },
                              };
                            });
                          },
                        };
                        return field === "description" ? (
                          <textarea {...inputProps} rows={3} />
                        ) : (
                          <input {...inputProps} type="text" />
                        );
                      }}
                    </FormField>
                  ))}
              </fieldset>
            ))}
          </div>
          {changedPages.length > 0 ? (
            <p role="status" className="text-sm text-muted-foreground">
              {he ? "שינויים בטיוטה בעמודים" : "Unpublished changes on"}{" "}
              {changedPages.map((key) => pageLabels[key][locale]).join(", ")}
            </p>
          ) : null}
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
          {canEdit ? (
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="mgmt-button mgmt-button--primary"
                disabled={!dirty || submitting || needsReload}
              >
                <Save size={16} aria-hidden="true" />
                {submitting
                  ? he
                    ? "מפרסם…"
                    : "Publishing…"
                  : he
                    ? "פרסום טקסט"
                    : "Publish page text"}
              </button>
              <button
                type="button"
                className="mgmt-button"
                disabled={!draft[page] || submitting}
                onClick={() => {
                  setDraft((current) => {
                    const next = { ...current };
                    delete next[page];
                    return next;
                  });
                  setMessage(null);
                }}
              >
                <RotateCcw size={16} aria-hidden="true" />
                {he
                  ? "ברירת מחדל לעמוד בטיוטה"
                  : "Use default page text in draft"}
              </button>
              <button
                type="button"
                className="mgmt-button"
                disabled={submitting || (!dirty && !needsReload)}
                onClick={
                  needsReload
                    ? reload
                    : () => {
                        setDraft(saved.copy);
                        setMessage(null);
                      }
                }
              >
                {needsReload
                  ? he
                    ? "טעינת טקסט שמור"
                    : "Reload saved text"
                  : he
                    ? "ביטול שינויים"
                    : "Discard changes"}
              </button>
            </div>
          ) : null}
        </form>
      )}
    </FormSection>
  );
}
