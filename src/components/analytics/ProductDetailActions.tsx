"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Phone, MessageSquare } from "lucide-react";
import { withLocale } from "@/lib/i18n";
import { storeCopy } from "@/features/catalog/store-copy";
import type { PublicContactActions } from "@/lib/contact-config";
import {
  trackProductContactClick,
  trackProductPhoneClick,
  trackProductWhatsAppClick,
} from "@/components/analytics/track";

interface ProductDetailActionsProps {
  productId: string;
  productSlug: string;
  productName: string;
  locale: "he" | "en";
  variantId?: string | null;
  /** Config-driven contact channels; null/absent hides the action. */
  contact?: PublicContactActions | null;
}

export function ProductDetailActions({
  productId,
  productSlug,
  productName,
  locale,
  variantId = null,
  contact = null,
}: ProductDetailActionsProps) {
  const copy = storeCopy[locale];
  const Arrow = locale === "he" ? ArrowRight : ArrowLeft;
  const quoteParams = new URLSearchParams({
    product: productId,
    item: productSlug,
  });
  if (variantId) quoteParams.set("variant", variantId);
  const quoteHref = `${withLocale(locale, "contact")}?${quoteParams.toString()}`;

  return (
    <div className="sf-product-actions-detail">
      <Link
        href={quoteHref}
        className="miro-button miro-button-primary sf-action-contact"
        onClick={() => trackProductContactClick(productId, locale)}
      >
        <MessageSquare size={18} aria-hidden="true" />
        {copy.contactForProduct}
        <Arrow size={17} aria-hidden="true" />
      </Link>
      {contact?.phoneHref || contact?.whatsapp ? (
        <div className="sf-action-secondary">
          {contact.phoneHref ? (
            <a
              href={`tel:${contact.phoneHref}`}
              className="sf-action-link"
              onClick={() => trackProductPhoneClick(productId, locale)}
              aria-label={copy.callForProduct}
            >
              <Phone size={18} aria-hidden="true" />
              <span>{copy.callForProduct}</span>
            </a>
          ) : null}
          {contact.whatsapp ? (
            <a
              href={`https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(`${copy.whatsappForProduct}: ${productName}`)}`}
              className="sf-action-link"
              onClick={() => trackProductWhatsAppClick(productId, locale)}
              aria-label={copy.whatsappForProduct}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageSquare size={18} aria-hidden="true" />
              <span>{copy.whatsappForProduct}</span>
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
