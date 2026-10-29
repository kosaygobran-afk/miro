"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Save, Sparkles } from "lucide-react";
import { glassSettingsSchema } from "@/lib/glass-settings";
import type { Locale } from "@/lib/i18n";
import { FormSection } from "@/components/management/ui/form-section";
import { ErrorState } from "@/components/management/ui/error-state";
import { Notice } from "@/components/management/ui/notice";
import styles from "./glass-preference.module.css";

type SavedGlass = {
  settings: { enabled: boolean };
  revision: string;
  editable: boolean;
};
type Failure = "load" | "conflict" | "unknown" | "failed" | null;

function parseSaved(value: unknown): SavedGlass | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const parsed = glassSettingsSchema.safeParse(data.settings);
  if (
    !parsed.success ||
    typeof data.revision !== "string" ||
    !Number.isFinite(Date.parse(data.revision)) ||
    typeof data.editable !== "boolean"
  ) {
    return null;
  }
  return {
    settings: parsed.data,
    revision: data.revision,
    editable: data.editable,
  };
}

/** One shared website setting. The API and database authorize CEO/admin saves. */
export function GlobalGlassSettings({ locale }: { locale: Locale }) {
  const he = locale === "he";
  const id = useId();
  const router = useRouter();
  const [saved, setSaved] = useState<SavedGlass | null>(null);
  const [draft, setDraft] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const [success, setSuccess] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const locked = failure !== null;
  const editable = saved?.editable === true;
  const dirty = saved !== null && draft !== saved.settings.enabled;

  const load = useCallback(async () => {
    if (inFlight.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    inFlight.current = true;
    setLoading(true);
    setSuccess(false);
    try {
      const response = await fetch("/api/management/settings/glass", {
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      const parsed = parseSaved(await response.json());
      if (!response.ok || !parsed) throw new Error("unavailable");
      if (mounted.current) {
        setSaved(parsed);
        setDraft(parsed.settings.enabled);
        setFailure(null);
        document.documentElement.dataset.glass = parsed.settings.enabled
          ? "on"
          : "off";
      }
    } catch {
      if (mounted.current && !controller.signal.aborted) setFailure("load");
    } finally {
      if (controllerRef.current === controller) inFlight.current = false;
      if (mounted.current && !controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      mounted.current = false;
      controllerRef.current?.abort();
      inFlight.current = false;
    };
  }, [load]);

  async function save() {
    if (!saved || !editable || !dirty || locked || inFlight.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    inFlight.current = true;
    setSaving(true);
    setSuccess(false);
    try {
      const response = await fetch("/api/management/settings/glass", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
        body: JSON.stringify({
          settings: { enabled: draft },
          revision: saved.revision,
        }),
      });
      if (response.status === 409) {
        if (mounted.current) setFailure("conflict");
        return;
      }
      if (!response.ok) {
        if (mounted.current)
          setFailure(response.status >= 500 ? "unknown" : "failed");
        return;
      }
      const parsed = parseSaved(await response.json());
      if (!parsed) throw new Error("unknown_save");
      if (mounted.current) {
        setSaved(parsed);
        setDraft(parsed.settings.enabled);
        setFailure(null);
        setSuccess(true);
        document.documentElement.dataset.glass = parsed.settings.enabled
          ? "on"
          : "off";
        router.refresh();
      }
    } catch {
      if (mounted.current && !controller.signal.aborted) setFailure("unknown");
    } finally {
      if (controllerRef.current === controller) inFlight.current = false;
      if (mounted.current && !controller.signal.aborted) setSaving(false);
    }
  }

  const message =
    failure === "conflict"
      ? he
        ? "ההגדרה השתנתה בינתיים. רעננו את הערך השמור לפני שינוי נוסף."
        : "This setting changed elsewhere. Refresh the saved value before making another change."
      : failure === "unknown"
        ? he
          ? "לא ניתן לאשר אם השמירה הושלמה. רעננו את הערך השמור לפני ניסיון נוסף."
          : "The save result is unknown. Refresh the saved value before trying again."
        : he
          ? "ההגדרה לא נשמרה או שלא ניתן לקרוא אותה. רעננו את הערך השמור לפני ניסיון נוסף."
          : "The setting could not be saved or read. Refresh the saved value before trying again.";

  return (
    <FormSection
      sectionId="settings-glass"
      icon={<Sparkles size={19} aria-hidden="true" />}
      title={
        he ? "מראה זכוכית במצב כהה לכל האתר" : "Site-wide Dark glass appearance"
      }
      description={
        he
          ? "הגדרה משותפת למצב כהה לכל המבקרים, הלקוחות והעובדים. מצבי ביניים ובהיר נשארים כפי שהם. מנכ״ל ומנהל פעילים יכולים לשמור. השינוי מופיע לאחר רענון העמוד או בביקור הבא."
          : "One shared Dark mode setting for all visitors, customers and staff. Mid and Light stay unchanged. Active CEOs and admins can save. Changes appear after a page refresh or on the next visit."
      }
    >
      {loading ? (
        <p role="status" className={styles.loading}>
          <Loader2 size={18} aria-hidden="true" />
          {he ? "טוען הגדרת זכוכית…" : "Loading glass setting…"}
        </p>
      ) : !saved ? (
        <ErrorState
          title={
            he ? "הגדרת הזכוכית אינה זמינה" : "Glass setting is unavailable"
          }
          description={
            he
              ? "יש לרענן את הערך השמור. אם השגיאה נמשכת, יש לבדוק את החיבור ואת מיגרציית ההגדרה."
              : "Refresh the saved value. If this persists, check the connection and settings migration."
          }
          onRetry={() => void load()}
          retryLabel={he ? "רענון הערך השמור" : "Refresh saved value"}
        />
      ) : (
        <div className={styles.preference}>
          <button
            className={styles.toggle}
            type="button"
            role="switch"
            data-glass-toggle
            aria-checked={draft}
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-help`}
            disabled={!editable || saving || locked}
            onClick={() => {
              setDraft((value) => !value);
              setSuccess(false);
            }}
          >
            <strong id={`${id}-label`}>
              {he
                ? "מראה זכוכית משופר — מצב כהה"
                : "Enhanced glass — Dark mode"}
            </strong>
            <span className={styles.state} aria-hidden="true">
              {draft ? (he ? "פעיל" : "On") : he ? "כבוי" : "Off"}
              <span className={styles.track}>
                <span className={styles.thumb} />
              </span>
            </span>
          </button>
          <p className={styles.help} id={`${id}-help`}>
            {he
              ? "צבעים עשירים יותר ועומק במצב כהה של גרסה 2 בלבד. כיבוי מחזיר את המצב הכהה למראה שלפני השדרוג. רק שמירה והחלה מפעילות את השינוי לכל המשתמשים. גרסה 1 והעדפת המערכת להפחתת שקיפות מקבלות עדיפות."
              : "Richer colors and depth only in Version 2 Dark mode. Off restores the Dark appearance before this enhancement. Save and apply activates the change for everyone. Version 1 and system reduced transparency take priority."}
          </p>
          {!editable && (
            <Notice tone="info">
              {he
                ? "אין הרשאת שמירה בחשבון זה."
                : "This account cannot save this setting."}
            </Notice>
          )}
          {failure && <Notice tone="warning">{message}</Notice>}
          {success && (
            <Notice tone="success">
              {he
                ? "ההגדרה נשמרה לכל האתר."
                : "The setting was saved for the whole website."}
            </Notice>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className="mgmt-button mgmt-button--primary"
              data-glass-save
              disabled={!editable || !dirty || saving || locked}
              onClick={() => void save()}
            >
              {saving ? (
                <Loader2 size={17} aria-hidden="true" />
              ) : (
                <Save size={17} aria-hidden="true" />
              )}
              {saving
                ? he
                  ? "שומר…"
                  : "Saving…"
                : he
                  ? "שמירה והחלה לכולם"
                  : "Save and apply for everyone"}
            </button>
            <button
              type="button"
              className="mgmt-button"
              data-glass-refresh
              disabled={saving}
              onClick={() => void load()}
            >
              <RefreshCw size={17} aria-hidden="true" />
              {he ? "רענון הערך השמור" : "Refresh saved value"}
            </button>
          </div>
        </div>
      )}
    </FormSection>
  );
}
