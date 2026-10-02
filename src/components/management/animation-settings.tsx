"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, RotateCcw, Save, Sparkles } from "lucide-react";
import {
  ANIMATION_DURATIONS,
  ANIMATION_FEATURES,
  animationSettingsSchema,
  DEFAULT_ANIMATION_SETTINGS,
  type AnimationSettings as AnimationSettingsValue,
} from "@/lib/animation-settings";
import {
  appearancePresetSchema,
  type AppearancePreset,
} from "@/lib/appearance-presets";
import {
  ActivationSwitch,
  ErrorState,
  FormSection,
  Notice,
  FormSkeleton,
} from "./ui";
import styles from "./animation-settings.module.css";

type SavedSettings = {
  settings: AnimationSettingsValue;
  revision: string;
  editable: boolean;
  versionOneBackup: AppearancePreset;
};

export function AnimationSettings({
  locale,
  isCeo,
}: {
  locale: "he" | "en";
  isCeo: boolean;
}) {
  const he = locale === "he";
  const [saved, setSaved] = useState<SavedSettings | null>(null);
  const [draft, setDraft] = useState<AnimationSettingsValue>(
    DEFAULT_ANIMATION_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [success, setSuccess] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const requestController = useRef<AbortController | null>(null);
  const editable = isCeo && saved?.editable === true;
  const busy = loading || saving;
  const dirty =
    saved !== null && JSON.stringify(draft) !== JSON.stringify(saved.settings);
  const valid = animationSettingsSchema.safeParse(draft).success;

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch("/api/management/settings/animation", {
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      const data = await response.json();
      const parsed = animationSettingsSchema.safeParse(data.settings);
      const backup = appearancePresetSchema.safeParse(data.versionOneBackup);
      if (
        !response.ok ||
        !parsed.success ||
        !backup.success ||
        typeof data.revision !== "string"
      )
        throw new Error("unavailable");
      if (mounted.current) {
        setSaved({
          settings: parsed.data,
          revision: data.revision,
          editable: data.editable === true,
          versionOneBackup: backup.data,
        });
        setDraft(parsed.data);
        setConflict(false);
        setSaveError(false);
        setSuccess(false);
        setRestoringBackup(false);
      }
    } catch {
      if (mounted.current && !controller.signal.aborted) setLoadError(true);
    } finally {
      if (requestController.current === controller) inFlight.current = false;
      if (mounted.current && !controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    // Initial state already represents loading. Start the request after the
    // effect has subscribed, including React's development remount check.
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      mounted.current = false;
      requestController.current?.abort();
      inFlight.current = false;
    };
  }, [load]);

  function change(
    updater: (value: AnimationSettingsValue) => AnimationSettingsValue,
  ) {
    if (!editable || busy) return;
    setDraft(updater);
    setSuccess(false);
    setSaveError(false);
    setRestoringBackup(false);
  }

  async function save() {
    if (!saved || !editable || !dirty || !valid || conflict || inFlight.current)
      return;
    inFlight.current = true;
    setSaving(true);
    setSaveError(false);
    setSuccess(false);
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const response = await fetch("/api/management/settings/animation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
        body: JSON.stringify({ settings: draft, revision: saved.revision }),
      });
      const data = await response.json();
      if (response.status === 409) {
        if (mounted.current) setConflict(true);
        return;
      }
      const parsed = animationSettingsSchema.safeParse(data.settings);
      if (!response.ok || !parsed.success || typeof data.revision !== "string")
        throw new Error("save_failed");
      if (mounted.current) {
        setSaved({
          settings: parsed.data,
          revision: data.revision,
          editable: data.editable === true,
          versionOneBackup: saved.versionOneBackup,
        });
        setDraft(parsed.data);
        setSuccess(true);
        setRestoringBackup(false);
        // The central runtime consumes only the validated public settings payload.
        window.dispatchEvent(
          new CustomEvent("miro-animation-settings-change", {
            detail: parsed.data,
          }),
        );
      }
    } catch {
      if (mounted.current && !controller.signal.aborted) setSaveError(true);
    } finally {
      if (requestController.current === controller) inFlight.current = false;
      if (mounted.current && !controller.signal.aborted) setSaving(false);
    }
  }

  return (
    <FormSection
      sectionId="settings-animation"
      title={he ? "הגדרות הנפשה" : "Animation settings"}
      icon={<Sparkles size={19} aria-hidden="true" />}
      description={
        he
          ? "שליטה בתנועה, במעברים ובמשוב בכל האתר ובממשק הניהול. כל האפשרויות מופעלות כברירת מחדל."
          : "Control motion, transitions and feedback across the website and management interface. Every option starts enabled."
      }
    >
      {loading ? (
        <FormSkeleton
          fields={6}
          label={he ? "טוען הגדרות הנפשה…" : "Loading animation settings…"}
        />
      ) : loadError && !saved ? (
        <ErrorState
          title={
            he
              ? "הגדרות ההנפשה לא זמינות"
              : "Animation settings are unavailable"
          }
          description={
            he
              ? "נסו שוב. אם השגיאה נמשכת, מנהל הפרויקט צריך להחיל את מיגרציות ההנפשה וגיבוי העיצוב ולבדוק את החיבור."
              : "Try again. If this persists, the project administrator must apply the animation and appearance backup migrations and check the connection."
          }
          onRetry={() => void load()}
          retryLabel={he ? "נסה שוב" : "Retry"}
        />
      ) : saved ? (
        <div className="space-y-5">
          {!editable && (
            <Notice tone="info">
              {he
                ? "תצוגה בלבד. רק מנכ״ל יכול לשמור שינויים בהגדרות ההנפשה."
                : "Read only. Only a CEO can save changes to animation settings."}
            </Notice>
          )}
          <div className={styles.backupCard}>
            <div>
              <h3 className="font-bold">
                {he
                  ? "גרסה1 — גיבוי העיצוב וההנפשות המקוריים"
                  : "Version1 — original appearance and animation backup"}
              </h3>
              <p className={styles.note}>
                {he
                  ? "צילום מצב מוגן מ־2 באוקטובר 2026: ערכות הצבעים הכהה, הבינונית והבהירה של אותו יום, שכבות העיצוב המקוריות והגדרות ההנפשה שנשמרו לפני שדרוג גרסה2. הגיבוי קבוע ואינו נדרס בשמירות הבאות."
                  : "Protected snapshot from 2 October 2026: that day’s dark, medium and light theme colors, original styling layers and animation settings saved before the Version2 enhancement. This backup is permanent and later saves do not overwrite it."}
              </p>
              <p className={styles.note}>
                {he
                  ? "הכנת שחזור מעתיקה את הגיבוי לטיוטה הזאת ומחליפה שינויים שטרם נשמרו כאן. רק הכפתור שמירה והחלה מפעיל אותה. הבחירה האישית של המבקר בכהה/בינוני/בהיר נשמרת; מוצרי החנות, עיצוב החנות, תכנים, אנשי קשר והרשאות אינם משתנים."
                  : "Preparing a restore copies the backup into this draft and replaces unsaved changes in this section. Only Save and apply activates it. Each visitor’s personal dark/medium/light choice is retained; catalog, store design, content, contact details and permissions are untouched."}
              </p>
              <p className={styles.note}>
                {he
                  ? `גרסה פעילה שמורה: ${saved.settings.appearanceVersion}. גרסה בטיוטה: ${draft.appearanceVersion}.`
                  : `Saved active version: ${saved.settings.appearanceVersion}. Draft version: ${draft.appearanceVersion}.`}
              </p>
            </div>
            {editable && (
              <button
                type="button"
                className="mgmt-button"
                disabled={busy}
                onClick={() => {
                  change(() =>
                    structuredClone(saved.versionOneBackup.animationSettings),
                  );
                  setRestoringBackup(true);
                }}
              >
                {he
                  ? "הכן שחזור גרסה1 בטיוטה"
                  : "Prepare Version1 restore in draft"}
              </button>
            )}
          </div>
          <div className={styles.switchRow}>
            <div>
              <h3 className="font-bold">
                {he ? "עיצוב משופר — גרסה2" : "Enhanced appearance — Version2"}
              </h3>
              <p id="animation-appearance-version-note" className={styles.note}>
                {he
                  ? "מפעיל את שכבת העיצוב המשופרת של גרסה2. בכיבוי, האתר משתמש במראה המקורי של גרסה1 עם הגדרות ההנפשה שבטיוטה הזאת. לשחזור גם של ההנפשות המקוריות, השתמשו בכפתור הכנת שחזור גרסה1. נדרשת שמירה והחלה."
                  : "Enables the enhanced Version2 styling layer. Off uses the original Version1 appearance with this draft’s animation choices. To restore the original animations too, use Prepare Version1 restore. Save and apply is required."}
              </p>
            </div>
            <ActivationSwitch
              active={draft.appearanceVersion === "2"}
              label={
                he ? "עיצוב משופר — גרסה2" : "Enhanced appearance — Version2"
              }
              aria-describedby="animation-appearance-version-note"
              disabled={!editable || busy}
              onClick={() =>
                change((value) => ({
                  ...value,
                  appearanceVersion:
                    value.appearanceVersion === "2" ? "1" : "2",
                }))
              }
            />
          </div>
          {restoringBackup && (
            <Notice tone={dirty ? "warning" : "info"}>
              {dirty
                ? he
                  ? "גיבוי גרסה1 הוכן בטיוטה. הוא עדיין לא פעיל. לחצו על שמירה והחלה כדי לשחזר אותו, או בטלו שינויים כדי לחזור להגדרות השמורות."
                  : "The Version1 backup is prepared in the draft. It is not active yet. Choose Save and apply to restore it, or Discard changes to return to the saved settings."
                : he
                  ? "גיבוי גרסה1 כבר שמור ופעיל. אין צורך בשמירה נוספת."
                  : "The Version1 backup is already saved and active. No further save is needed."}
            </Notice>
          )}
          <div className={styles.switchRow}>
            <div>
              <h3 id="animation-master-label" className="font-bold">
                {he ? "הפעלת מערכת ההנפשה" : "Enable animation system"}
              </h3>
              <p id="animation-master-note" className={styles.note}>
                {he
                  ? "מתג ראשי לכל התנועה. בכיבוי, המעברים והאפקטים נעצרים; תוכן, ניווט, מצייני טעינה, הודעות שמירה ומיקוד מקלדת ממשיכים לפעול. ההעדפות האישיות לכל מתג נשמרות להפעלה מחדש."
                  : "Master switch for all motion. Off stops transitions and effects; content, navigation, loading placeholders, saving messages and keyboard focus remain functional. Individual switch choices are retained for when you turn it on again."}
              </p>
            </div>
            <ActivationSwitch
              active={draft.enabled}
              label={he ? "הפעלת מערכת ההנפשה" : "Enable animation system"}
              aria-describedby="animation-master-note"
              disabled={!editable || busy}
              onClick={() =>
                change((value) => ({ ...value, enabled: !value.enabled }))
              }
            />
          </div>
          <p className={styles.note}>
            {he
              ? "העדפת תנועה מופחתת במכשיר של המבקר תמיד גוברת על ההגדרות האלה. שינויים נכנסים לתוקף רק לאחר שמירה; הם אינם מעכבים ניווט או בקשות נתונים."
              : "A visitor’s device preference for reduced motion always takes priority. Changes take effect after saving; they never delay navigation or data requests."}
          </p>

          <div className={styles.featureGrid}>
            {ANIMATION_FEATURES.map((feature) => (
              <div className={styles.switchRow} key={feature.key}>
                <div>
                  <h4 className="font-semibold">
                    {he ? feature.he : feature.en}
                  </h4>
                  <p
                    className={styles.note}
                    id={`animation-${feature.key}-note`}
                  >
                    {he ? feature.noteHe : feature.noteEn}
                  </p>
                </div>
                <ActivationSwitch
                  active={draft.features[feature.key]}
                  label={he ? feature.he : feature.en}
                  aria-describedby={`animation-${feature.key}-note`}
                  disabled={!editable || busy}
                  onClick={() =>
                    change((value) => ({
                      ...value,
                      features: {
                        ...value.features,
                        [feature.key]: !value.features[feature.key],
                      },
                    }))
                  }
                />
              </div>
            ))}
          </div>
          {!draft.enabled && (
            <Notice tone="info">
              {he
                ? "התנועה כבויה באמצעות המתג הראשי. אפשר להתאים את המתגים והזמנים כדי להכין את ההפעלה הבאה."
                : "Motion is disabled by the master switch. You can still configure individual switches and timing for the next time you enable it."}
            </Notice>
          )}

          <fieldset disabled={!editable || busy} className="space-y-4">
            <legend className="font-bold">
              {he ? "סגנון ותזמון" : "Style and timing"}
            </legend>
            <p className={styles.note}>
              {he
                ? "הזמנים הם באלפיות שנייה (ms). הטווחים שומרים על תגובה מהירה. זמן הניווט שולט בהשלמת הפס בלבד ואינו משך טעינת העמוד. מחזור מציין הטעינה שולט בקצב ההדגשה ואינו זמן המתנה."
                : "Times are in milliseconds (ms). The allowed ranges keep interactions responsive. Navigation timing controls only the beam’s completion; it is not the page loading time. The placeholder cycle controls highlight speed; it is not a wait time."}
            </p>
            <div className={styles.durationGrid}>
              <label className={styles.field}>
                {he ? "מעבר ערכת נושא" : "Theme transition"}
                <select
                  className="mgmt-input"
                  value={draft.themeStyle}
                  aria-label={he ? "מעבר ערכת נושא" : "Theme transition"}
                  onChange={(event) =>
                    change((value) => ({
                      ...value,
                      themeStyle: event.target
                        .value as AnimationSettingsValue["themeStyle"],
                    }))
                  }
                >
                  <option value="radial">
                    {he ? "חשיפה מעגלית מהכפתור" : "Radial reveal from button"}
                  </option>
                  <option value="fade">{he ? "מעבר שקיפות" : "Fade"}</option>
                </select>
              </label>
              <label className={styles.field}>
                {he ? "חשיפת עמוד" : "Page reveal style"}
                <select
                  className="mgmt-input"
                  value={draft.pageStyle}
                  aria-label={he ? "חשיפת עמוד" : "Page reveal style"}
                  onChange={(event) =>
                    change((value) => ({
                      ...value,
                      pageStyle: event.target
                        .value as AnimationSettingsValue["pageStyle"],
                    }))
                  }
                >
                  <option value="lift">
                    {he ? "עלייה עדינה ושקיפות" : "Gentle lift and fade"}
                  </option>
                  <option value="fade">
                    {he ? "שקיפות בלבד" : "Fade only"}
                  </option>
                </select>
              </label>
              <label className={styles.field}>
                {he ? "עקומת תנועה" : "Motion easing"}
                <select
                  className="mgmt-input"
                  value={draft.easing}
                  aria-label={he ? "עקומת תנועה" : "Motion easing"}
                  onChange={(event) =>
                    change((value) => ({
                      ...value,
                      easing: event.target
                        .value as AnimationSettingsValue["easing"],
                    }))
                  }
                >
                  <option value="standard">
                    {he ? "רגילה — תנועה מאוזנת" : "Standard — balanced motion"}
                  </option>
                  <option value="snappy">
                    {he ? "חדה — האצה מהירה" : "Snappy — quick acceleration"}
                  </option>
                  <option value="soft">
                    {he ? "רכה — סיום עדין" : "Soft — gentle finish"}
                  </option>
                </select>
              </label>
              {ANIMATION_DURATIONS.map((entry) => (
                <label className={styles.field} key={entry.key}>
                  {he ? entry.he : entry.en}
                  <input
                    className="mgmt-input"
                    type="number"
                    aria-label={he ? entry.he : entry.en}
                    inputMode="numeric"
                    min={entry.min}
                    max={entry.max}
                    step={1}
                    value={draft.durations[entry.key]}
                    aria-describedby={`animation-duration-${entry.key}`}
                    aria-invalid={
                      draft.durations[entry.key] < entry.min ||
                      draft.durations[entry.key] > entry.max ||
                      !Number.isInteger(draft.durations[entry.key]) ||
                      undefined
                    }
                    onChange={(event) =>
                      change((value) => ({
                        ...value,
                        durations: {
                          ...value.durations,
                          [entry.key]: Number(event.target.value),
                        },
                      }))
                    }
                  />
                  <span
                    className={styles.note}
                    id={`animation-duration-${entry.key}`}
                    dir="auto"
                  >
                    {entry.min}–{entry.max} ms · {he ? "ברירת מחדל" : "Default"}
                    : {entry.default} ms
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {!valid && (
            <Notice tone="danger">
              {he
                ? "יש להזין לכל זמן מספר שלם בטווח שמופיע מתחת לשדה."
                : "Enter a whole number within the range shown below each timing field."}
            </Notice>
          )}
          {conflict && (
            <Notice
              tone="warning"
              action={
                <button
                  type="button"
                  className="mgmt-button"
                  onClick={() => void load()}
                  disabled={busy}
                >
                  {he
                    ? "טען גרסה שמורה ובטל טיוטה"
                    : "Reload saved version and discard draft"}
                </button>
              }
            >
              {he
                ? "מנכ״ל אחר שינה את ההגדרות. הטיוטה שלך נשמרת במסך הזה, אך יש לטעון את הגרסה העדכנית לפני שמירה."
                : "Another CEO changed these settings. Your draft stays on this screen, but you must reload the latest version before saving."}
            </Notice>
          )}
          {saveError && (
            <Notice tone="danger">
              {he
                ? "השמירה נכשלה. הטיוטה נשמרה במסך — אפשר לנסות שוב באמצעות כפתור השמירה."
                : "Saving failed. Your draft is preserved on this screen; use the save button to retry."}
            </Notice>
          )}
          {loadError && (
            <Notice tone="danger">
              {he
                ? "טעינת הגרסה השמורה נכשלה. הטיוטה הקיימת נשמרה; נסו לטעון שוב."
                : "Reloading failed. Your existing draft was preserved; try reloading again."}
            </Notice>
          )}
          {success && (
            <Notice tone="success">
              {he
                ? "הגדרות ההנפשה נשמרו והוחלו."
                : "Animation settings saved and applied."}
            </Notice>
          )}
          <div className={styles.actions}>
            {editable && (
              <>
                <button
                  type="button"
                  className="mgmt-button mgmt-button--primary"
                  disabled={busy || !dirty || !valid || conflict}
                  aria-busy={saving || undefined}
                  onClick={() => void save()}
                >
                  {saving ? (
                    <Loader2
                      size={16}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Save size={16} aria-hidden="true" />
                  )}
                  {saving
                    ? he
                      ? "שומר הגדרות…"
                      : "Saving settings…"
                    : saveError
                      ? he
                        ? "נסה לשמור שוב"
                        : "Retry save"
                      : he
                        ? "שמור והחל הגדרות"
                        : "Save and apply settings"}
                </button>
                <button
                  type="button"
                  className="mgmt-button"
                  disabled={busy || !dirty}
                  onClick={() => {
                    setDraft(saved.settings);
                    setSaveError(false);
                    setSuccess(false);
                    setRestoringBackup(false);
                  }}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  {he ? "בטל שינויים" : "Discard changes"}
                </button>
                <button
                  type="button"
                  className="mgmt-button"
                  disabled={busy}
                  onClick={() =>
                    change(() => structuredClone(DEFAULT_ANIMATION_SETTINGS))
                  }
                >
                  {he ? "הכן ברירות מחדל" : "Use defaults in draft"}
                </button>
              </>
            )}
            <button
              type="button"
              className="mgmt-button"
              disabled={busy}
              onClick={() => void load()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              {dirty
                ? he
                  ? "טען הגדרות שמורות ובטל טיוטה"
                  : "Reload saved settings and discard draft"
                : he
                  ? "טען הגדרות שמורות"
                  : "Reload saved settings"}
            </button>
          </div>
        </div>
      ) : null}
    </FormSection>
  );
}
