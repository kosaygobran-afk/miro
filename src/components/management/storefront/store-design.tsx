"use client";
import { RevealImage as Image } from "@/components/ui/reveal-image";
import Link from "@/components/motion/motion-link";
import { useEffect, useState, useCallback } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Eye,
  ImagePlus,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { PageHeader, FormSection } from "../ui";
import {
  storefrontDesignSchema,
  defaultStorefrontDesign,
  type StorefrontDesign,
} from "@/lib/storefront-design";
import styles from "./store-design.module.css";

type Slide = StorefrontDesign["hero"]["slides"][number];
type Brand = StorefrontDesign["brands"]["items"][number];
export function StoreDesign({
  locale,
  isCeo,
}: {
  locale: "he" | "en";
  isCeo: boolean;
}) {
  const he = locale === "he";
  const [design, setDesign] = useState<StorefrontDesign | null>(null);
  const [revision, setRevision] = useState("");
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/management/storefront/design", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load design");
      setDesign(data.design);
      setSaved(JSON.stringify(data.design));
      setRevision(data.revision);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load design");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);
  const dirty = design !== null && JSON.stringify(design) !== saved;
  async function save() {
    if (!design || !isCeo) return;
    const parsed = storefrontDesignSchema.safeParse(design);
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(" · "),
      );
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/management/storefront/design", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design: parsed.data, revision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save");
      setDesign(data.design);
      setSaved(JSON.stringify(data.design));
      setRevision(data.revision);
      setMessage(
        he
          ? "נשמר. העיצוב זמין כעת בחנות."
          : "Saved. This design is now available in the store.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setSaving(false);
    }
  }
  async function uploadImage(kind: "hero" | "brands", id: string, file?: File) {
    if (!file || !isCeo || uploading) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/management/storefront/design/assets", {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to upload image");
      setDesign((current) => {
        if (!current) return current;
        if (kind === "hero")
          return {
            ...current,
            hero: {
              ...current.hero,
              slides: current.hero.slides.map((slide) =>
                slide.id === id ? { ...slide, imageUrl: data.imageUrl } : slide,
              ),
            },
          };
        return {
          ...current,
          brands: {
            ...current.brands,
            items: current.brands.items.map((brand) =>
              brand.id === id ? { ...brand, imageUrl: data.imageUrl } : brand,
            ),
          },
        };
      });
      setMessage(
        he
          ? "התמונה הועלתה. יש לפרסם את העיצוב כדי להציג אותה בחנות."
          : "Image uploaded. Publish the design to show it in the store.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to upload image");
    } finally {
      setUploading(false);
    }
  }
  function updateHero<K extends keyof StorefrontDesign["hero"]>(
    key: K,
    value: StorefrontDesign["hero"][K],
  ) {
    setDesign((current) =>
      current
        ? { ...current, hero: { ...current.hero, [key]: value } }
        : current,
    );
  }
  function updateBrands<K extends keyof StorefrontDesign["brands"]>(
    key: K,
    value: StorefrontDesign["brands"][K],
  ) {
    setDesign((current) =>
      current
        ? { ...current, brands: { ...current.brands, [key]: value } }
        : current,
    );
  }
  function slideChange(index: number, patch: Partial<Slide>) {
    if (design)
      updateHero(
        "slides",
        design.hero.slides.map((slide, i) =>
          i === index ? { ...slide, ...patch } : slide,
        ),
      );
  }
  function brandChange(index: number, patch: Partial<Brand>) {
    if (design)
      updateBrands(
        "items",
        design.brands.items.map((brand, i) =>
          i === index ? { ...brand, ...patch } : brand,
        ),
      );
  }
  function move<T>(items: T[], index: number, direction: number) {
    const result = [...items];
    const target = index + direction;
    if (target >= 0 && target < items.length)
      [result[index], result[target]] = [result[target], result[index]];
    return result;
  }
  const text = (en: string, heb: string) => (he ? heb : en);
  return (
    <div className={styles.page}>
      <PageHeader
        title={text("Store design studio", "סטודיו עיצוב החנות")}
        subtitle={text(
          "Backgrounds, brand marks and motion — connected to the customer storefront.",
          "רקעים, מותגים ותנועה — מחוברים ישירות לחנות הלקוחות.",
        )}
        actions={
          <>
            <Link
              className="mgmt-button mgmt-button--secondary"
              href={`/${locale}`}
              target="_blank"
              rel="noopener"
            >
              <Eye size={16} />
              {text("View store", "צפייה בחנות")}
            </Link>
            <button
              className="mgmt-button mgmt-button--secondary"
              type="button"
              onClick={() => void load()}
              disabled={loading || saving || uploading || dirty}
            >
              <RefreshCw size={16} />
              {text("Reload", "רענון")}
            </button>
            {isCeo ? (
              <button
                className="mgmt-button mgmt-button--secondary"
                type="button"
                disabled={!dirty || saving || uploading || loading}
                onClick={() => {
                  setDesign(JSON.parse(saved) as StorefrontDesign);
                  setError("");
                  setMessage("");
                }}
              >
                <RotateCcw size={16} />
                {text("Discard changes", "ביטול שינויים")}
              </button>
            ) : null}
            {isCeo ? (
              <button
                className="mgmt-button mgmt-button--primary"
                type="button"
                disabled={!dirty || saving || uploading || loading}
                onClick={() => void save()}
              >
                <Save size={16} />
                {saving
                  ? text("Saving…", "שומר…")
                  : text("Publish design", "פרסום העיצוב")}
              </button>
            ) : null}
          </>
        }
      />
      {!isCeo ? (
        <p className={styles.notice}>
          <Lock size={17} />
          {text(
            "Read-only preview. Only the CEO can publish design changes.",
            "תצוגה בלבד. רק המנכ״ל יכול לפרסם שינויי עיצוב.",
          )}
        </p>
      ) : (
        <p className={styles.notice}>
          <SlidersHorizontal size={17} />
          {text(
            "Changes stay in this editor until you publish. Product selection is managed in the moving product rail.",
            "השינויים נשארים בעורך עד לפרסום. בחירת המוצרים מתבצעת במסך פס המוצרים.",
          )}{" "}
          <Link href={`/${locale}/admin/storefront-merchandising`}>
            {text("Manage products →", "ניהול מוצרים ←")}
          </Link>
        </p>
      )}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className={styles.success}>
          {message}
        </p>
      ) : null}
      {loading ? (
        <p role="status">{text("Loading store design…", "טוען עיצוב חנות…")}</p>
      ) : null}
      {design ? (
        <fieldset
          disabled={!isCeo || saving || uploading}
          className={styles.editor}
        >
          <FormSection
            title={text("Store backgrounds", "רקעי החנות")}
            icon={<ImagePlus size={20} />}
            description={text(
              "Five coordinated scenes. Reorder, replace or add images using a local image path or an HTTPS image URL.",
              "חמש סצנות מתואמות. אפשר לסדר, להחליף או להוסיף תמונות באמצעות נתיב מקומי או כתובת תמונה מאובטחת.",
            )}
          >
            <div className={styles.options}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={design.hero.enabled}
                  onChange={(e) => updateHero("enabled", e.target.checked)}
                />
                {text("Automatic rotation", "החלפה אוטומטית")}
              </label>
              <label>
                {text("Seconds per background (5–60)", "שניות לכל רקע (5–60)")}
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={design.hero.intervalSeconds}
                  onChange={(e) =>
                    updateHero("intervalSeconds", Number(e.target.value))
                  }
                />
              </label>
              <label>
                {text("Transition", "סוג המעבר")}
                <select
                  value={design.hero.transition}
                  onChange={(e) =>
                    updateHero(
                      "transition",
                      e.target.value as StorefrontDesign["hero"]["transition"],
                    )
                  }
                >
                  <option value="fade">{text("Crossfade", "המסה")}</option>
                  <option value="slide">{text("Slide", "החלקה")}</option>
                  <option value="zoom">{text("Soft zoom", "זום עדין")}</option>
                  <option value="none">{text("Instant", "מיידי")}</option>
                </select>
              </label>
              <label>
                {text(
                  "Transition duration, ms (150–1500)",
                  "משך המעבר במ״ש (150–1500)",
                )}
                <input
                  type="number"
                  min={150}
                  max={1500}
                  step={50}
                  value={design.hero.transitionMs}
                  onChange={(e) =>
                    updateHero("transitionMs", Number(e.target.value))
                  }
                />
              </label>
            </div>
            <div className={styles.slides}>
              {design.hero.slides.map((slide, index) => (
                <article className={styles.slide} key={slide.id}>
                  <div className={styles.scene}>
                    <Image
                      src={
                        /^https:\/\//.test(slide.imageUrl) ||
                        slide.imageUrl.startsWith("/images/")
                          ? slide.imageUrl
                          : defaultStorefrontDesign.hero.slides[0].imageUrl
                      }
                      alt=""
                      fill
                      unoptimized
                    />
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className={styles.cardFields}>
                    <label>
                      {text("Background name", "שם הרקע")}
                      <input
                        maxLength={100}
                        value={slide.title}
                        onChange={(e) =>
                          slideChange(index, { title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      {text("Image URL", "כתובת התמונה")}
                      <input
                        dir="ltr"
                        maxLength={2048}
                        value={slide.imageUrl}
                        onChange={(e) =>
                          slideChange(index, { imageUrl: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      {text(
                        "Upload background (up to 5 MB)",
                        "העלאת רקע (עד 5 MB)",
                      )}
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.avif,.svg"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          void uploadImage("hero", slide.id, file);
                        }}
                      />
                    </label>
                    <div className={styles.cardActions}>
                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={slide.enabled}
                          onChange={(e) =>
                            slideChange(index, { enabled: e.target.checked })
                          }
                        />
                        {text("Visible", "פעיל")}
                      </label>
                      <button
                        type="button"
                        disabled={index === 0}
                        aria-label={`${text("Move up", "הזזה למעלה")}: ${slide.title}`}
                        onClick={() =>
                          updateHero(
                            "slides",
                            move(design.hero.slides, index, -1),
                          )
                        }
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        disabled={index === design.hero.slides.length - 1}
                        aria-label={`${text("Move down", "הזזה למטה")}: ${slide.title}`}
                        onClick={() =>
                          updateHero(
                            "slides",
                            move(design.hero.slides, index, 1),
                          )
                        }
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        type="button"
                        disabled={design.hero.slides.length === 1}
                        aria-label={`${text("Delete background", "מחיקת רקע")}: ${slide.title}`}
                        onClick={() =>
                          updateHero(
                            "slides",
                            design.hero.slides.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <button
              className="mgmt-button mgmt-button--secondary"
              type="button"
              disabled={design.hero.slides.length >= 20}
              onClick={() =>
                updateHero("slides", [
                  ...design.hero.slides,
                  {
                    ...defaultStorefrontDesign.hero.slides[0],
                    id: crypto.randomUUID(),
                    title: text("New background", "רקע חדש"),
                  },
                ])
              }
            >
              <Plus size={16} />
              {text("Add background", "הוספת רקע")}
            </button>
          </FormSection>
          <FormSection
            title={text("Company logo rail", "פס סמלי החברות")}
            icon={<Building2 size={20} />}
            description={text(
              "Equal-size logo slots below the categories. Brand names identify technologies; they do not imply a partnership.",
              "סמלים בגודל אחיד מתחת לקטגוריות. שמות המותגים מזהים טכנולוגיות ואינם מציינים שותפות.",
            )}
          >
            <div className={styles.options}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={design.brands.enabled}
                  onChange={(e) => updateBrands("enabled", e.target.checked)}
                />
                {text("Show brand rail", "הצגת פס המותגים")}
              </label>
              <label>
                {text(
                  "Seconds per full loop (15–120)",
                  "שניות לסיבוב מלא (15–120)",
                )}
                <input
                  type="number"
                  min={15}
                  max={120}
                  value={design.brands.durationSeconds}
                  onChange={(e) =>
                    updateBrands("durationSeconds", Number(e.target.value))
                  }
                />
              </label>
            </div>
            <div className={styles.brands}>
              {design.brands.items.map((brand, index) => (
                <article className={styles.brand} key={brand.id}>
                  <div className={styles.mark}>
                    <Image
                      src={
                        /^https:\/\//.test(brand.imageUrl) ||
                        brand.imageUrl.startsWith("/images/")
                          ? brand.imageUrl
                          : defaultStorefrontDesign.brands.items[0].imageUrl
                      }
                      alt={brand.name}
                      width={118}
                      height={38}
                      unoptimized
                    />
                  </div>
                  <label>
                    {text("Company name", "שם החברה")}
                    <input
                      maxLength={80}
                      value={brand.name}
                      onChange={(e) =>
                        brandChange(index, { name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {text("Logo URL", "כתובת הסמל")}
                    <input
                      dir="ltr"
                      maxLength={2048}
                      value={brand.imageUrl}
                      onChange={(e) =>
                        brandChange(index, { imageUrl: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {text("Upload logo (up to 5 MB)", "העלאת סמל (עד 5 MB)")}
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.avif,.svg"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        void uploadImage("brands", brand.id, file);
                      }}
                    />
                  </label>
                  <div className={styles.cardActions}>
                    <label className={styles.toggle}>
                      <input
                        type="checkbox"
                        checked={brand.enabled}
                        onChange={(e) =>
                          brandChange(index, { enabled: e.target.checked })
                        }
                      />
                      {text("Visible", "פעיל")}
                    </label>
                    <button
                      type="button"
                      disabled={index === 0}
                      aria-label={`${text("Move up", "הזזה למעלה")}: ${brand.name}`}
                      onClick={() =>
                        updateBrands(
                          "items",
                          move(design.brands.items, index, -1),
                        )
                      }
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      disabled={index === design.brands.items.length - 1}
                      aria-label={`${text("Move down", "הזזה למטה")}: ${brand.name}`}
                      onClick={() =>
                        updateBrands(
                          "items",
                          move(design.brands.items, index, 1),
                        )
                      }
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`${text("Delete company", "מחיקת חברה")}: ${brand.name}`}
                      onClick={() =>
                        updateBrands(
                          "items",
                          design.brands.items.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <button
              className="mgmt-button mgmt-button--secondary"
              type="button"
              disabled={design.brands.items.length >= 24}
              onClick={() =>
                updateBrands("items", [
                  ...design.brands.items,
                  {
                    id: crypto.randomUUID(),
                    name: text("New company", "חברה חדשה"),
                    imageUrl: defaultStorefrontDesign.brands.items[1].imageUrl,
                    enabled: true,
                  },
                ])
              }
            >
              <Plus size={16} />
              {text("Add company", "הוספת חברה")}
            </button>
          </FormSection>
          <FormSection
            title={text("Product motion", "תנועת מוצרים")}
            icon={<SlidersHorizontal size={20} />}
            description={text(
              "Hover pauses the rail. Reduced-motion settings always take priority.",
              "ריחוף עוצר את הפס. העדפת תנועה מופחתת תמיד קודמת להגדרות אלו.",
            )}
          >
            <div className={styles.options}>
              <label>
                {text(
                  "Rail speed, pixels / second (15–60)",
                  "מהירות הפס, פיקסלים לשנייה (15–60)",
                )}
                <input
                  type="number"
                  min={15}
                  max={60}
                  value={design.products.pixelsPerSecond}
                  onChange={(e) =>
                    setDesign({
                      ...design,
                      products: {
                        ...design.products,
                        pixelsPerSecond: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                {text(
                  "Hover delay, ms (120–600)",
                  "השהיית ריחוף במ״ש (120–600)",
                )}
                <input
                  type="number"
                  min={120}
                  max={600}
                  step={20}
                  value={design.products.hoverDelayMs}
                  onChange={(e) =>
                    setDesign({
                      ...design,
                      products: {
                        ...design.products,
                        hoverDelayMs: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
          </FormSection>
        </fieldset>
      ) : null}
    </div>
  );
}
