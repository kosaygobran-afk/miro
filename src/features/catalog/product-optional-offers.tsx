"use client";

import { useId, useState } from "react";
import { Boxes, Package, PackagePlus } from "lucide-react";
import { RevealImage as Image } from "@/components/ui/reveal-image";
import type {
  ProductOptionKind,
  PublicOptionalOffer,
} from "@/lib/catalog/product-options";
import styles from "./product-optional-offers.module.css";

type Locale = "he" | "en";

const groups: ProductOptionKind[] = ["complementary", "accompanying"];
export const MAX_SELECTED_OPTIONAL_OFFERS = 99;

export function optionalOfferCanBeSelected(offer: PublicOptionalOffer) {
  return (
    offer.unitPrice !== null &&
    Number.isFinite(offer.unitPrice) &&
    offer.unitPrice > 0 &&
    !offer.availabilityUnconfirmed &&
    Number.isFinite(offer.stockQty) &&
    offer.stockQty > 0
  );
}

/** Offer prices use agorot precision, including a configured fractional price. */
export function formatOptionalOfferPrice(price: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(price);
}

function offerStatus(
  offer: PublicOptionalOffer,
  locale: Locale,
  parentAvailable: boolean,
) {
  if (!parentAvailable)
    return locale === "he"
      ? "ניתן לבחור תוספות כשהמוצר הראשי זמין להוספה לסל"
      : "Options can be selected when the main product is available to add";
  if (offer.availabilityUnconfirmed || !Number.isFinite(offer.stockQty))
    return locale === "he" ? "זמינות לפי בירור" : "Availability on request";
  if (offer.stockQty <= 0)
    return locale === "he" ? "אזל מהמלאי" : "Out of stock";
  if (
    offer.unitPrice === null ||
    !Number.isFinite(offer.unitPrice) ||
    offer.unitPrice <= 0
  )
    return locale === "he" ? "מחיר לפי בירור" : "Price on request";
  return locale === "he"
    ? `${offer.stockQty.toLocaleString("he-IL")} במלאי`
    : `${offer.stockQty.toLocaleString("en-IL")} in stock`;
}

function OptionalOfferChoice({
  offer,
  locale,
  selected,
  parentAvailable,
  onToggle,
  limitReached,
  limitDescriptionId,
}: {
  offer: PublicOptionalOffer;
  locale: Locale;
  selected: boolean;
  parentAvailable: boolean;
  onToggle: (id: string, selected: boolean) => void;
  limitReached: boolean;
  limitDescriptionId: string;
}) {
  const id = useId();
  const [failedImage, setFailedImage] = useState(false);
  const available = parentAvailable && optionalOfferCanBeSelected(offer);
  const limitBlocked = limitReached && !selected;
  const label = offer.label.trim() || offer.name;
  const showProductName = label !== offer.name;
  const discounted =
    offer.unitPrice !== null &&
    offer.regularPrice !== null &&
    offer.unitPrice < offer.regularPrice;
  const status = offerStatus(offer, locale, parentAvailable);

  return (
    <li
      className={styles.option}
      data-selected={selected}
      data-disabled={!available || limitBlocked}
    >
      <label className={styles.choice}>
        <input
          className={styles.checkbox}
          type="checkbox"
          name={`product-option-${offer.kind}`}
          value={offer.id}
          checked={selected}
          disabled={!available || limitBlocked}
          onChange={(event) => onToggle(offer.id, event.target.checked)}
          aria-labelledby={`${id}-name`}
          aria-describedby={`${id}-price ${id}-stock${offer.sku ? ` ${id}-sku` : ""}${limitBlocked ? ` ${limitDescriptionId}` : ""}`}
        />
        <span className={styles.media} aria-hidden="true">
          {offer.imageUrl && !failedImage ? (
            <Image
              src={offer.imageUrl}
              alt=""
              width={64}
              height={64}
              sizes="64px"
              className={styles.image}
              unoptimized={offer.imageUrl.toLowerCase().includes(".svg")}
              onError={() => setFailedImage(true)}
            />
          ) : (
            <Package size={25} aria-hidden="true" />
          )}
        </span>
        <span className={styles.copy}>
          <span className={styles.name} id={`${id}-name`} dir="auto">
            {label}
          </span>
          {showProductName ? (
            <span className={styles.productName} dir="auto">
              {offer.name}
            </span>
          ) : null}
          {offer.sku ? (
            <span className={styles.sku} id={`${id}-sku`}>
              <span>{locale === "he" ? "מק״ט" : "SKU"}</span>
              <bdi dir="ltr">{offer.sku}</bdi>
            </span>
          ) : null}
          <span className={styles.price} id={`${id}-price`}>
            {offer.unitPrice !== null &&
            Number.isFinite(offer.unitPrice) &&
            offer.unitPrice > 0 ? (
              <strong data-discounted={discounted}>
                <span aria-hidden="true">+ </span>
                <bdi dir="auto">
                  {formatOptionalOfferPrice(offer.unitPrice, locale)}
                </bdi>
              </strong>
            ) : (
              <strong>
                {locale === "he" ? "מחיר לפי בירור" : "Price on request"}
              </strong>
            )}
            {discounted && offer.regularPrice !== null ? (
              <del>
                <span className="sr-only">
                  {locale === "he" ? "מחיר רגיל: " : "Regular price: "}
                </span>
                <bdi dir="auto">
                  {formatOptionalOfferPrice(offer.regularPrice, locale)}
                </bdi>
              </del>
            ) : null}
          </span>
          <span
            className={styles.stock}
            id={`${id}-stock`}
            data-available={available}
          >
            <span className={styles.stockDot} aria-hidden="true" />
            {status}
          </span>
        </span>
      </label>
    </li>
  );
}

export function ProductOptionalOffers({
  offers,
  locale,
  selectedIds,
  onToggle,
  parentAvailable,
  basePrice,
  unavailable = false,
}: {
  offers: PublicOptionalOffer[];
  locale: Locale;
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string, selected: boolean) => void;
  parentAvailable: boolean;
  basePrice: number | null;
  unavailable?: boolean;
}) {
  const id = useId();
  if (unavailable)
    return (
      <div
        className={styles.unavailable}
        role="status"
        data-product-optional-offers-unavailable
      >
        {locale === "he"
          ? "אפשרויות נוספות אינן זמינות כרגע"
          : "Additional options are temporarily unavailable"}
      </div>
    );
  if (offers.length === 0) return null;

  const selectedOffers = offers.filter(
    (offer) =>
      selectedIds.has(offer.id) &&
      parentAvailable &&
      optionalOfferCanBeSelected(offer),
  );
  const extraAgorot = selectedOffers.reduce(
    (sum, offer) => sum + Math.round(offer.unitPrice! * 100),
    0,
  );
  const total =
    basePrice !== null
      ? (Math.round(basePrice * 100) + extraAgorot) / 100
      : null;
  const limitReached = selectedOffers.length >= MAX_SELECTED_OPTIONAL_OFFERS;

  return (
    <section
      className={styles.section}
      aria-label={
        locale === "he" ? "אפשרויות נוספות למוצר" : "Optional product additions"
      }
      data-product-optional-offers
    >
      {limitReached ? (
        <p className={styles.limit} id={`${id}-limit`} role="status">
          {locale === "he"
            ? "אפשר לבחור עד 99 תוספות להזמנה אחת של המוצר. הסירו בחירה כדי לבחור פריט אחר."
            : "Choose up to 99 options for one main-product selection. Uncheck an item to choose another."}
        </p>
      ) : null}
      {groups.map((kind) => {
        const groupOffers = offers.filter((offer) => offer.kind === kind);
        if (groupOffers.length === 0) return null;
        const Icon = kind === "complementary" ? PackagePlus : Boxes;
        const title =
          kind === "complementary"
            ? locale === "he"
              ? "מוצרים משלימים"
              : "Complementary products"
            : locale === "he"
              ? "מוצרים נלווים"
              : "Accompanying products";
        return (
          <fieldset
            className={styles.group}
            key={kind}
            aria-describedby={`${id}-${kind}-hint`}
          >
            <legend className={styles.legend}>
              <Icon size={19} aria-hidden="true" />
              <span>{title}</span>
              <span className={styles.optional}>
                {locale === "he" ? "לבחירתך" : "Optional"}
              </span>
            </legend>
            <p className={styles.hint} id={`${id}-${kind}-hint`}>
              {locale === "he"
                ? "אפשר לבחור כמה מוצרים ולהוסיף אותם יחד עם המוצר הראשי."
                : "Choose any items to add together with the main product."}
            </p>
            <ul className={styles.list}>
              {groupOffers.map((offer) => (
                <OptionalOfferChoice
                  key={`${offer.id}:${offer.revision}:${offer.imageUrl ?? ""}`}
                  offer={offer}
                  locale={locale}
                  selected={selectedIds.has(offer.id)}
                  parentAvailable={parentAvailable}
                  onToggle={onToggle}
                  limitReached={limitReached}
                  limitDescriptionId={`${id}-limit`}
                />
              ))}
            </ul>
          </fieldset>
        );
      })}
      <div className={styles.summary} aria-live="polite" aria-atomic="true">
        <div className={styles.summaryHeading}>
          <span>
            {selectedOffers.length > 0
              ? locale === "he"
                ? `${selectedOffers.length} תוספות נבחרו`
                : `${selectedOffers.length} options selected`
              : locale === "he"
                ? "ללא תוספות שנבחרו"
                : "No options selected"}
          </span>
          {total !== null ? (
            <strong>
              <span className="sr-only">
                {locale === "he"
                  ? "סה״כ משוער ליחידה: "
                  : "Estimated total per unit: "}
              </span>
              <bdi dir="auto">{formatOptionalOfferPrice(total, locale)}</bdi>
            </strong>
          ) : null}
        </div>
        <p>
          {locale === "he"
            ? "כל בחירה מוסיפה פריט אחד לכל יחידה של המוצר הראשי. הסכום המשוער כולל מע״מ; המחיר והזמינות נבדקים שוב בעת שליחת הבקשה או ההזמנה."
            : "Each selection adds one item per main-product unit. Estimated total includes VAT; prices and availability are checked again when submitting the request or order."}
        </p>
      </div>
    </section>
  );
}
