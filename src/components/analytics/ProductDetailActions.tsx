"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Phone, MessageSquare } from "lucide-react";
import { withLocale } from "@/lib/i18n";
import { storeCopy } from "@/features/catalog/store-copy";
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
}

export function ProductDetailActions({
  productId,
  productSlug,
  productName,
  locale,
}: ProductDetailActionsProps) {
  const copy = storeCopy[locale];
  const Arrow = locale === "he" ? ArrowRight : ArrowLeft;
  const quoteHref = withLocale(
    locale,
    `contact?product=${encodeURIComponent(productSlug)}`,
  );

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
      <div className="sf-action-secondary">
        <a
          href={`tel:+972-00-000-0000`}
          className="sf-action-link"
          onClick={() => trackProductPhoneClick(productId, locale)}
          aria-label={copy.callForProduct}
        >
          <Phone size={18} aria-hidden="true" />
          <span>{copy.callForProduct}</span>
        </a>
        <a
          href={`https://wa.me/972000000000?text=${encodeURIComponent(`${copy.whatsappForProduct}: ${productName}`)}`}
          className="sf-action-link"
          onClick={() => trackProductWhatsAppClick(productId, locale)}
          aria-label={copy.whatsappForProduct}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageSquare size={18} aria-hidden="true" />
          <span>{copy.whatsappForProduct}</span>
        </a>
      </div>
    </div>
  );
}
