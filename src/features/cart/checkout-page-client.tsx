"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "@/components/motion/motion-link";
import { CheckCircle2, LockKeyhole, ShoppingBag } from "lucide-react";
import { useCart } from "@/features/cart/cart-context";
import { cartCopy } from "@/features/cart/cart-copy";
import { formatPrice } from "@/lib/catalog/pricing";
import { withLocale } from "@/lib/i18n";
import { CartSkeleton } from "./cart-skeleton";

type CheckoutFields = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  notes: string;
  company: string;
};

const initialFields: CheckoutFields = {
  name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  postalCode: "",
  notes: "",
  company: "",
};

export function CheckoutPageClient({ locale }: { locale: "he" | "en" }) {
  const { items, subtotal, hydrated, clearCart } = useCart();
  const copy = cartCopy[locale];
  const [fields, setFields] = useState(initialFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const startedAt = useRef<number | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  function setField(name: keyof CheckoutFields, value: string) {
    setFields((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || items.length === 0) return;

    const required = [
      fields.name,
      fields.email,
      fields.phone,
      fields.address,
      fields.city,
    ];
    if (required.some((value) => !value.trim())) {
      setError(copy.requiredError);
      requestAnimationFrame(() => statusRef.current?.focus());
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(fields.email)) {
      setError(copy.emailError);
      requestAnimationFrame(() => statusRef.current?.focus());
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.name,
          email: fields.email,
          phone: fields.phone,
          message:
            fields.notes.trim() ||
            (locale === "he"
              ? `בקשת הזמנה עבור ${items.length} מוצרים`
              : `Checkout request for ${items.length} products`),
          locale,
          source: "checkout_page",
          company: fields.company,
          startedAt: startedAt.current ?? undefined,
          cart: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            slug: item.slug,
            name: item.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
          })),
          shipping: {
            address: fields.address,
            city: fields.city,
            postalCode: fields.postalCode,
          },
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message || copy.unavailable);
      }
      clearCart();
      setSuccess(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : copy.unavailable,
      );
      requestAnimationFrame(() => statusRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated) {
    return <CartSkeleton locale={locale} checkout />;
  }

  if (success) {
    return (
      <div className="sf-checkout-page">
        <div className="miro-container sf-checkout-success">
          <CheckCircle2 size={44} aria-hidden="true" />
          <h1>{copy.successTitle}</h1>
          <p>{copy.successText}</p>
          <Link
            href={withLocale(locale)}
            className="miro-button miro-button-primary"
          >
            {copy.backToStore}
          </Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="sf-checkout-page">
        <div className="miro-container sf-cart-empty">
          <ShoppingBag size={38} aria-hidden="true" />
          <h1>{copy.emptyTitle}</h1>
          <p>{copy.emptyText}</p>
          <Link
            href={withLocale(locale)}
            className="miro-button miro-button-primary"
          >
            {copy.browse}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="sf-checkout-page">
      <div className="miro-container">
        <header className="sf-cart-heading">
          <span className="sf-cart-heading-icon" aria-hidden="true">
            <ShoppingBag size={24} />
          </span>
          <div>
            <h1>{copy.checkoutTitle}</h1>
            <p>{copy.checkoutIntro}</p>
          </div>
        </header>

        <div className="sf-checkout-layout">
          <form className="sf-checkout-form" onSubmit={handleSubmit} noValidate>
            {error ? (
              <div
                ref={statusRef}
                tabIndex={-1}
                className="sf-checkout-error"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <fieldset>
              <legend>{copy.contact}</legend>
              <div className="sf-checkout-fields">
                <label>
                  <span>{copy.name}</span>
                  <input
                    className="miro-input"
                    autoComplete="name"
                    maxLength={120}
                    required
                    value={fields.name}
                    onChange={(event) => setField("name", event.target.value)}
                  />
                </label>
                <label>
                  <span>{copy.email}</span>
                  <input
                    className="miro-input"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    required
                    value={fields.email}
                    onChange={(event) => setField("email", event.target.value)}
                  />
                </label>
                <label>
                  <span>{copy.phone}</span>
                  <input
                    className="miro-input"
                    type="tel"
                    autoComplete="tel"
                    maxLength={40}
                    required
                    value={fields.phone}
                    onChange={(event) => setField("phone", event.target.value)}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>{copy.shipping}</legend>
              <div className="sf-checkout-fields">
                <label className="sf-checkout-wide">
                  <span>{copy.address}</span>
                  <input
                    className="miro-input"
                    autoComplete="street-address"
                    maxLength={240}
                    required
                    value={fields.address}
                    onChange={(event) =>
                      setField("address", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>{copy.city}</span>
                  <input
                    className="miro-input"
                    autoComplete="address-level2"
                    maxLength={120}
                    required
                    value={fields.city}
                    onChange={(event) => setField("city", event.target.value)}
                  />
                </label>
                <label>
                  <span>{copy.postalCode}</span>
                  <input
                    className="miro-input"
                    autoComplete="postal-code"
                    maxLength={20}
                    value={fields.postalCode}
                    onChange={(event) =>
                      setField("postalCode", event.target.value)
                    }
                  />
                </label>
                <label className="sf-checkout-wide">
                  <span>{copy.notes}</span>
                  <textarea
                    className="miro-input"
                    maxLength={1000}
                    value={fields.notes}
                    onChange={(event) => setField("notes", event.target.value)}
                  />
                </label>
              </div>
            </fieldset>

            <div className="sf-checkout-honeypot" aria-hidden="true">
              <label>
                Company
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={fields.company}
                  onChange={(event) => setField("company", event.target.value)}
                />
              </label>
            </div>

            <button
              type="submit"
              className="miro-button miro-button-primary sf-checkout-submit"
              disabled={submitting}
            >
              {submitting ? copy.submitting : copy.submit}
            </button>
            <p className="sf-checkout-payment-note">
              <LockKeyhole size={16} aria-hidden="true" />
              {copy.noPayment}
            </p>
          </form>

          <aside className="sf-checkout-summary">
            <h2>{copy.summary}</h2>
            <ul>
              {items.map((item) => (
                <li key={`${item.productId}:${item.variantId ?? "default"}`}>
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <strong>
                    {formatPrice(item.unitPrice * item.quantity, locale, "—")}
                  </strong>
                </li>
              ))}
            </ul>
            <div className="sf-checkout-total">
              <span>{copy.subtotal}</span>
              <strong>{formatPrice(subtotal, locale, "—")}</strong>
            </div>
            <p>{copy.estimateNote}</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
