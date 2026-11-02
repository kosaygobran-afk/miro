import "server-only";
import PDFDocument from "pdfkit";
import type * as PDFKit from "pdfkit";
import bidiFactory from "bidi-js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { formatDocumentTimestamp } from "./format";
export { formatDocumentTimestamp } from "./format";
import { paperStyles } from "./paper-styles";
import { validateDocumentSnapshot } from "./snapshot";
import {
  drawPaperBrand,
  drawPaperIcon,
  paperBrandSvg,
  paperIconSvg,
  PAPER_RULE_SVG,
  PAPER_TEMPLATE_VERSION,
  type PaperIcon,
} from "./paper-artwork";
import type {
  FiscalDocumentSnapshot,
  DocumentLanguage,
  ValidatedDocumentSnapshot,
} from "./types";

const RECEIPT = { width: 226.77, height: 841.89 };
const bidi = bidiFactory();
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const COLORS = {
  ink: "#17202A",
  muted: "#596574",
  line: "#D8DEE6",
  gold: "#B58927",
  paleGold: "#FFF4D3",
  white: "#FFFFFF",
  panel: "#F4F6F8",
};

export type DocumentLayout = "a4" | "receipt80";

export interface RenderedDraftDocument {
  pdfBytes: Uint8Array;
  accessibleHtml: string;
  sourceHash: string;
  layout: DocumentLayout;
  watermark: "DRAFT";
}

const LABELS: Record<DocumentLanguage, Record<string, string>> = {
  he: {
    quote: "הצעת מחיר",
    proforma: "חשבונית עסקה / פרופורמה",
    transaction_invoice: "חשבונית עסקה",
    tax_invoice: "חשבונית מס",
    receipt: "קבלה",
    invoice_receipt: "חשבונית מס קבלה",
    credit_note: "הודעת זיכוי",
    correction: "מסמך תיקון",
    draft: "טיוטה - לא מסמך מס",
    document: "מסמך",
    date: "תאריך",
    time: "שעה (שעון ישראל)",
    previewId: "מזהה טיוטה",
    continued: "המשך",
    customer: "לכבוד",
    business: "פרטי העסק",
    description: "תיאור",
    quantity: "כמות",
    net: "לפני מע״מ",
    vat: "מע״מ",
    total: "סה״כ לתשלום",
    credit: "סה״כ לזיכוי",
    paid: "תשלומים מתועדים",
    balance: "יתרה",
    payment: "אמצעי תשלום",
    allocation: "מספר הקצאה",
    related: "מסמך מקור",
    page: "עמוד",
    reference: "אסמכתא",
    note: "הערה",
    registration: "עוסק / חברה",
    legalName: "שם משפטי",
    tradeName: "שם מסחרי",
    vatNumber: "מספר מע״מ",
    phone: "טלפון",
    email: "דוא״ל",
    address: "כתובת",
    taxable: "בסיס חייב",
    gross: "סכום כולל",
    thanks: "תודה רבה",
    noNumber: "ללא מספר מסמך רשמי",
    unit: "מחיר ליחידה",
    discount: "הנחה",
  },
  en: {
    quote: "Quotation",
    proforma: "Proforma invoice",
    transaction_invoice: "Transaction invoice",
    tax_invoice: "Tax invoice",
    receipt: "Receipt",
    invoice_receipt: "Tax invoice and receipt",
    credit_note: "Credit note",
    correction: "Correction document",
    draft: "DRAFT - NOT A TAX DOCUMENT",
    document: "Document",
    date: "Date",
    time: "Time (Israel)",
    previewId: "Draft ID",
    continued: "Continued",
    customer: "Bill to",
    business: "Business details",
    description: "Description",
    quantity: "Qty",
    net: "Net",
    vat: "VAT",
    total: "Total due",
    credit: "Credit total",
    paid: "Recorded payments",
    balance: "Balance",
    payment: "Payment method",
    allocation: "Allocation number",
    related: "Related document",
    page: "Page",
    reference: "Reference",
    note: "Note",
    registration: "Business registration",
    legalName: "Legal name",
    tradeName: "Trade name",
    vatNumber: "VAT number",
    phone: "Phone",
    email: "Email",
    address: "Address",
    taxable: "Taxable base",
    gross: "Gross",
    thanks: "Thank you",
    noNumber: "No official document number",
    unit: "Unit price",
    discount: "Discount",
  },
};

function labels(lang: DocumentLanguage) {
  return LABELS[lang];
}

function money(
  agorot: number,
  language: DocumentLanguage,
  negative = false,
): string {
  const major = Math.floor(agorot / 100);
  const minor = String(agorot % 100).padStart(2, "0");
  const localized = major.toLocaleString(
    language === "he" ? "he-IL" : "en-IL",
    { useGrouping: true },
  );
  return `${negative ? "-" : ""}ILS ${localized}.${minor}`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fullAddress(
  address?: Partial<{
    street: string;
    city: string;
    postal_code: string;
    country: string;
  }>,
): string {
  return address
    ? [address.street, address.city, address.postal_code, address.country]
        .filter(Boolean)
        .join(", ")
    : "";
}

function typeLabel(document: FiscalDocumentSnapshot): string {
  return labels(document.identity_snapshot.document_language)[document.type];
}

function paymentMethod(value: string, lang: DocumentLanguage): string {
  const methods: Record<string, [string, string]> = {
    cash: ["מזומן", "Cash"],
    card: ["כרטיס אשראי", "Card"],
    credit_card: ["כרטיס אשראי", "Card"],
    bit: ["bit", "bit"],
    bank_transfer: ["העברה בנקאית", "Bank transfer"],
    cheque: ["המחאה", "Cheque"],
    check: ["המחאה", "Cheque"],
    manual: ["רישום ידני", "Manual record"],
  };
  return methods[value]?.[lang === "he" ? 0 : 1] ?? value;
}

type DetailField = {
  label: string;
  value: string;
  ltr?: boolean;
  wide?: boolean;
  emphasis?: boolean;
  icon?: PaperIcon;
};
function businessFields(document: FiscalDocumentSnapshot): DetailField[] {
  const b = document.identity_snapshot,
    l = labels(b.document_language);
  return [
    {
      label: l.tradeName,
      value: b.trade_name && b.trade_name !== b.legal_name ? b.trade_name : "",
    },
    { label: l.legalName, value: b.legal_name },
    { label: l.registration, value: b.registration_number, ltr: true },
    { label: l.vatNumber, value: b.vat_number, ltr: true },
    { label: l.address, value: fullAddress(b.address) },
    { label: l.phone, value: b.phone, ltr: true },
    { label: l.email, value: b.email, ltr: true },
  ].filter((field) => field.value);
}
function customerFields(document: FiscalDocumentSnapshot): DetailField[] {
  const c = document.customer_snapshot,
    l = labels(document.identity_snapshot.document_language);
  return [
    { label: l.customer, value: c.name },
    {
      label: l.legalName,
      value: c.company_name && c.company_name !== c.name ? c.company_name : "",
    },
    { label: l.registration, value: c.registration_number ?? "", ltr: true },
    { label: l.address, value: fullAddress(c.address) },
    { label: l.phone, value: c.phone ?? "", ltr: true },
    { label: l.email, value: c.email ?? "", ltr: true },
  ].filter((field) => field.value);
}
function summaryFields(document: FiscalDocumentSnapshot): DetailField[] {
  const lang = document.identity_snapshot.document_language,
    l = labels(lang);
  const paid = document.payment_references.reduce(
    (sum, p) => sum + p.amount_agorot,
    0,
  );
  return [
    { label: l.net, value: money(document.net_agorot, lang), ltr: true },
    { label: l.vat, value: money(document.vat_agorot, lang), ltr: true },
    {
      label: document.type === "credit_note" ? l.credit : l.total,
      value: money(
        document.total_agorot,
        lang,
        document.type === "credit_note",
      ),
      ltr: true,
    },
    ...(paid > 0
      ? [{ label: l.paid, value: money(paid, lang), ltr: true }]
      : []),
    ...(paid > 0 && paid < document.total_agorot
      ? [
          {
            label: l.balance,
            value: money(document.total_agorot - paid, lang),
            ltr: true,
          },
        ]
      : []),
  ];
}
function itemDetails(
  item: FiscalDocumentSnapshot["items"][number],
  lang: DocumentLanguage,
) {
  const l = labels(lang);
  return [
    ...(item.unit_agorot !== undefined
      ? [{ label: l.unit, value: money(item.unit_agorot, lang), ltr: true }]
      : []),
    ...(item.discount_agorot !== undefined
      ? [
          {
            label: l.discount,
            value: money(item.discount_agorot, lang),
            ltr: true,
          },
        ]
      : []),
  ];
}

function profileFields(document: FiscalDocumentSnapshot): DetailField[] {
  const business = document.identity_snapshot,
    l = labels(business.document_language);
  const promotedLabel =
    business.trade_name && business.trade_name !== business.legal_name
      ? l.tradeName
      : l.legalName;
  return businessFields(document)
    .filter((field) => field.label !== promotedLabel)
    .map((field) => ({
      ...field,
      wide: field.label === l.legalName || field.label === l.address,
    }));
}

function accessibleHtml(
  document: FiscalDocumentSnapshot,
  layout: DocumentLayout,
): string {
  const lang = document.identity_snapshot.document_language,
    rtl = lang === "he",
    l = labels(lang);
  const stamp = formatDocumentTimestamp(
    document.issued_at ?? document.created_at,
    lang,
  );
  const bdi = (text: string, ltr = false) =>
    `<bdi dir="${ltr ? "ltr" : "auto"}">${escapeHtml(text)}</bdi>`;
  const details = (fields: DetailField[], className = "") =>
    `<dl class="detail-grid ${className}">${fields.map((field, index) => `<div class="field${className === "summary-grid" && index === 2 ? " total-field" : ""}" data-field="${escapeHtml(field.label)}" data-reading-anchor="start"${field.wide ? ' data-wide="true"' : ""}><dt>${field.icon ? paperIconSvg(field.icon) : ""}${escapeHtml(field.label)}</dt><dd>${bdi(field.value, field.ltr)}</dd></div>`).join("")}</dl>`;
  const sectionTitle = (icon: PaperIcon, value: string) =>
    `<h2>${paperIconSvg(icon)}<span>${escapeHtml(value)}</span></h2>`;
  const rows = document.items
    .map((item, index) => {
      const amountFields = itemDetails(item, lang);
      return layout === "a4"
        ? `<tr><td><span class="item-description">${bdi(item.description)}</span>${amountFields.length ? `<div class="item-meta">${details(amountFields)}</div>` : ""}</td><td class="numeric">${bdi(String(item.quantity), true)}</td><td class="numeric">${bdi(money(item.net_agorot, lang), true)}</td><td class="numeric">${bdi(money(item.vat_agorot, lang), true)}</td><td class="numeric">${bdi(money(item.gross_agorot, lang, document.type === "credit_note"), true)}</td></tr>`
        : `<article class="receipt-item"><h3>${bdi(item.description)}</h3>${details([{ label: l.quantity, value: String(item.quantity), ltr: true }, ...amountFields, { label: l.net, value: money(item.net_agorot, lang), ltr: true }, { label: l.vat, value: money(item.vat_agorot, lang), ltr: true }, { label: l.gross, value: money(item.gross_agorot, lang, document.type === "credit_note"), ltr: true }])}<span class="sr-only">${index + 1}</span></article>`;
    })
    .join("");
  const payments = document.payment_references
    .map((payment) => {
      const collected = payment.collected_at
        ? formatDocumentTimestamp(payment.collected_at, lang)
        : null;
      return `<article class="payment">${details([
        { label: l.payment, value: paymentMethod(payment.method, lang) },
        {
          label: l.gross,
          value: money(payment.amount_agorot, lang),
          ltr: true,
        },
        ...(payment.reference
          ? [{ label: l.reference, value: payment.reference }]
          : []),
        ...(collected
          ? [
              { label: l.date, value: collected.date, ltr: true },
              { label: l.time, value: collected.time, ltr: true },
            ]
          : []),
      ])}</article>`;
    })
    .join("");
  const paymentsHtml = payments
    ? `<section class="payments">${sectionTitle("payment", l.paid)}${payments}</section>`
    : "";
  const summary = `<section class="summary" aria-label="${escapeHtml(l.total)}">${details(
    summaryFields(document).map((field, index) => ({
      ...field,
      wide: index === 2,
    })),
    "summary-grid",
  )}</section>`;
  const businessName =
    document.identity_snapshot.trade_name ||
    document.identity_snapshot.legal_name;
  const contacts = businessFields(document).filter(
    (field) => field.label === l.phone || field.label === l.email,
  );
  return `<!doctype html><html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(typeLabel(document))} - ${escapeHtml(l.draft)}</title><style>${paperStyles(layout)}</style></head><body><main class="paper" data-layout="${layout}" data-template="${PAPER_TEMPLATE_VERSION}">
<header><div class="masthead"><section class="business-identity" aria-label="${escapeHtml(l.business)}"><p class="kicker">${escapeHtml(l.business)}</p><h2 class="business-name">${bdi(businessName)}</h2>${details(profileFields(document), "business-profile")}</section><div class="brand-position">${paperBrandSvg()}</div></div>
<div class="title-band"><h1>${escapeHtml(typeLabel(document))}</h1><p class="draft">${escapeHtml(l.draft)}</p></div><div class="metadata">${details(
    [
      { label: l.date, value: stamp.date, ltr: true, icon: "calendar" },
      { label: l.time, value: stamp.time, ltr: true, icon: "clock" },
      { label: l.previewId, value: document.id, ltr: true },
    ],
  )}</div><p class="number-note">${escapeHtml(document.number ? l.document : l.noNumber)}${document.number ? `: ${bdi(document.number, true)}` : ""}</p>${PAPER_RULE_SVG}</header>
<section class="recipient">${sectionTitle("customer", l.customer)}${details(customerFields(document))}</section>
${layout === "a4" ? `<table class="items"><caption>ILS</caption><thead><tr>${[l.description, l.quantity, l.net, l.vat, l.gross].map((label, index) => `<th scope="col"${index > 0 ? ' class="numeric"' : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>` : `<section aria-label="${escapeHtml(l.description)}">${rows}</section>`}
${payments ? `<div class="closing">${paymentsHtml}${summary}</div>` : summary}
${document.allocation_number || document.related_document_number ? `<section class="notes">${details([...(document.allocation_number ? [{ label: l.allocation, value: document.allocation_number, ltr: true }] : []), ...(document.related_document_number ? [{ label: l.related, value: document.related_document_number, ltr: true }] : [])])}</section>` : ""}
${document.note ? `<section class="notes">${sectionTitle("note", l.note)}<p>${bdi(document.note)}</p></section>` : ""}
<footer class="paper-footer">${PAPER_RULE_SVG}${details(contacts)}<p>${escapeHtml(l.draft)} · ${bdi(document.id, true)}</p></footer></main></body></html>`;
}

function wrapText(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  fontSize: number,
): string[] {
  const paragraphs = text.split(/\r?\n/u);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/u).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      doc.fontSize(fontSize);
      if (doc.widthOfString(candidate) <= width || !line) {
        if (doc.widthOfString(candidate) <= width) {
          line = candidate;
          continue;
        }
      } else {
        lines.push(line);
        line = "";
      }
      if (doc.widthOfString(word) > width) {
        let segment = "";
        for (const { segment: grapheme } of graphemes.segment(word)) {
          const next = segment + grapheme;
          if (segment && doc.widthOfString(next) > width) {
            lines.push(segment);
            segment = grapheme;
          } else segment = next;
        }
        line = segment;
      } else {
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function bidiVisualTokens(
  text: string,
  language: DocumentLanguage,
): string[] {
  if (!/[\u0590-\u05ff]/u.test(text)) return text.match(/\s+|[^\s]+/gu) ?? [];
  const embedding = bidi.getEmbeddingLevels(
    text,
    language === "he" ? "rtl" : "ltr",
  );
  const mirrored = bidi.getMirroredCharactersMap(text, embedding.levels);
  const tokens: string[] = [],
    levels: number[] = [];
  let offset = 0;
  for (const word of text.match(/\s+|[^\s]+/gu) ?? []) {
    let start = 0;
    while (start < word.length) {
      const level = embedding.levels[offset + start];
      let end = start + 1;
      while (end < word.length && embedding.levels[offset + end] === level)
        end++;
      let token = "";
      for (let index = start; index < end;) {
        const character = String.fromCodePoint(word.codePointAt(index)!);
        token += mirrored.get(offset + index) ?? character;
        index += character.length;
      }
      // Fontkit reverses Hebrew glyph runs, but does not mirror parentheses.
      // Pure punctuation runs have no Hebrew shaper and need their own reversal.
      if (level % 2 && !/[\u0590-\u05ff]/u.test(token))
        token = Array.from(token).reverse().join("");
      tokens.push(token);
      levels.push(level);
      start = end;
    }
    offset += word.length;
  }

  // Apply UAX #9 to same-level shaping runs. Numeric/model runs retain LTR
  // order even inside a word; Hebrew glyph shaping is applied exactly once.
  const order = tokens.map((_, index) => index);
  const maxLevel = Math.max(...levels, 0);
  const minOddLevel = levels.reduce(
    (lowest, level) => (level % 2 === 1 ? Math.min(lowest, level) : lowest),
    maxLevel + 1,
  );
  if (minOddLevel > maxLevel) return tokens;
  for (let level = maxLevel; level >= minOddLevel; level--) {
    for (let start = 0; start < order.length;) {
      if (levels[order[start]] < level) {
        start++;
        continue;
      }
      let end = start + 1;
      while (end < order.length && levels[order[end]] >= level) end++;
      for (let left = start, right = end - 1; left < right; left++, right--) {
        [order[left], order[right]] = [order[right], order[left]];
      }
      start = end;
    }
  }
  return order.map((index) => tokens[index]);
}

function drawBidiLine(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  align: "left" | "right" | "center",
  language: DocumentLanguage,
): void {
  if (!/[\u0590-\u05ff]/u.test(text)) {
    doc.text(text, x, y, { width, lineBreak: false, align });
    return;
  }
  const tokens = bidiVisualTokens(text, language);
  const tokenWidths = tokens.map((token) => doc.widthOfString(token));
  const totalWidth = tokenWidths.reduce((sum, value) => sum + value, 0);
  let cursor =
    align === "right"
      ? x + width - totalWidth
      : align === "center"
        ? x + (width - totalWidth) / 2
        : x;
  doc.markContent("Span", { actual: text });
  tokens.forEach((token, index) => {
    doc.text(token, cursor, y, { lineBreak: false });
    cursor += tokenWidths[index];
  });
  doc.endMarkedContent();
}

function drawText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  options: {
    fontSize?: number;
    bold?: boolean;
    color?: string;
    align?: "left" | "right" | "center";
    language: DocumentLanguage;
    lineHeight?: number;
  },
): number {
  const fontSize = options.fontSize ?? 10;
  doc
    .font(options.bold ? "NotoBold" : "NotoRegular")
    .fontSize(fontSize)
    .fillColor(options.color ?? COLORS.ink);
  const lines = wrapText(doc, text, width, fontSize);
  const directionAlignment =
    options.align ?? (options.language === "he" ? "right" : "left");
  for (const line of lines) {
    drawBidiLine(doc, line, x, y, width, directionAlignment, options.language);
    y += options.lineHeight ?? fontSize * 1.5;
  }
  return y;
}

async function loadFonts(): Promise<{ regular: Buffer; bold: Buffer }> {
  const root = process.cwd();
  const [regular, bold] = await Promise.all([
    readFile(join(root, "assets/fonts/commerce/NotoSansHebrew-Regular.ttf")),
    readFile(join(root, "assets/fonts/commerce/NotoSansHebrew-Bold.ttf")),
  ]);
  return { regular, bold };
}

function textLanguage(
  value: string,
  fallback: DocumentLanguage,
): DocumentLanguage {
  const first = value.match(/[A-Za-z\u0590-\u05ff]/u)?.[0];
  return first ? (/[\u0590-\u05ff]/u.test(first) ? "he" : "en") : fallback;
}

async function renderLayout(
  document: FiscalDocumentSnapshot,
  layout: DocumentLayout,
  fonts: { regular: Buffer; bold: Buffer },
): Promise<Uint8Array> {
  const doc = new PDFDocument({
    size: layout === "a4" ? "A4" : [RECEIPT.width, RECEIPT.height],
    margin: 0,
    bufferPages: true,
    compress: true,
    info: {
      Title: `${typeLabel(document)} - ${document.id}`,
      Author: document.identity_snapshot.legal_name,
      Subject: "Draft preview; not an official tax document",
      Keywords: PAPER_TEMPLATE_VERSION,
      CreationDate: new Date(document.created_at),
      ModDate: new Date(document.created_at),
    },
  });
  const completed = new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.once("error", reject);
    doc.once("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
  });
  doc
    .registerFont("NotoRegular", fonts.regular)
    .registerFont("NotoBold", fonts.bold);
  const lang = document.identity_snapshot.document_language,
    rtl = lang === "he",
    l = labels(lang);
  const margin = layout === "a4" ? 36 : 12;
  const usable = doc.page.width - 2 * margin;
  const align = rtl ? "right" : "left";
  let y = 0,
    pageNo = 0;
  let pendingProfile = false;
  const measure = (value: string, width: number, size = 9, bold = false) => {
    doc.font(bold ? "NotoBold" : "NotoRegular").fontSize(size);
    return wrapText(doc, value, width, size);
  };
  const footerFields = businessFields(document).filter(
    (field) => field.label === l.phone || field.label === l.email,
  );
  const footerCellW = (usable - 16) / 2;
  const footerTextH = Math.max(
    0,
    ...footerFields.map(
      (field) => measure(field.value, footerCellW, 6.5).length * 9.1,
    ),
  );
  const footerReserve = Math.max(52, footerTextH + 36);
  const bottom = doc.page.height - footerReserve;
  doc.info.Keywords = `${PAPER_TEMPLATE_VERSION}; footer-reserve=${footerReserve.toFixed(2)}`;
  const write = (
    value: string,
    x: number,
    top: number,
    width: number,
    size = 9,
    bold = false,
    ltr = false,
    color = COLORS.ink,
    paragraphLanguage?: DocumentLanguage,
    anchor?: "left" | "right" | "center",
  ) =>
    drawText(doc, value, x, top, width, {
      fontSize: size,
      bold,
      color,
      align: anchor ?? align,
      language: ltr ? "en" : (paragraphLanguage ?? textLanguage(value, lang)),
      lineHeight: size * 1.4,
    });
  const rule = (top: number, x = margin, width = usable) => {
    doc
      .save()
      .moveTo(x, top)
      .lineTo(x + width, top)
      .lineWidth(0.6)
      .stroke(COLORS.line)
      .restore();
  };
  const labelSize = (size: number) => Math.max(6.8, size * 0.76);
  const valueSize = (field: DetailField, size: number) =>
    field.emphasis ? size * 1.8 : size;
  const labelHeight = (field: DetailField, width: number, size: number) =>
    measure(
      field.label,
      width - (field.icon ? 18 : 0),
      labelSize(size),
      field.emphasis,
    ).length *
    labelSize(size) *
    1.4;
  const fieldHeight = (
    field: DetailField,
    width: number,
    size = 9,
    bold = false,
    band?: number,
  ) =>
    (band ?? labelHeight(field, width, size)) +
    3 +
    measure(field.value, width, valueSize(field, size), bold || field.emphasis)
      .length *
      valueSize(field, size) *
      1.4 +
    (layout === "a4" ? 5 : 7);
  const fieldAt = (
    field: DetailField,
    x: number,
    top: number,
    width: number,
    size = 9,
    bold = false,
    band?: number,
  ) => {
    const labelBand = band ?? labelHeight(field, width, size);
    if (field.icon)
      drawPaperIcon(doc, field.icon, rtl ? x + width - 11 : x, top, 11);
    write(
      field.label,
      rtl ? x : x + (field.icon ? 18 : 0),
      top,
      width - (field.icon ? 18 : 0),
      labelSize(size),
      bold || field.emphasis,
      false,
      COLORS.muted,
    );
    write(
      field.value,
      x,
      top + labelBand + 3,
      width,
      valueSize(field, size),
      bold || field.emphasis,
      field.ltr,
    );
    return top + fieldHeight(field, width, size, bold, labelBand);
  };
  const gridRows = (
    fields: DetailField[],
    width: number,
    columns = 2,
    size = 9,
  ) => {
    const groups: DetailField[][] = [];
    let group: DetailField[] = [];
    for (const field of fields) {
      if (field.wide) {
        if (group.length) groups.push(group);
        groups.push([field]);
        group = [];
      } else {
        group.push(field);
        if (group.length === columns) {
          groups.push(group);
          group = [];
        }
      }
    }
    if (group.length) groups.push(group);
    return groups.map((fields) => {
      const cellWidth = fields[0].wide
        ? width
        : (width - (columns - 1) * 14) / columns;
      const band = Math.max(
        ...fields.map((field) => labelHeight(field, cellWidth, size)),
      );
      return {
        fields,
        cellWidth,
        band,
        height: Math.max(
          ...fields.map((field) =>
            fieldHeight(field, cellWidth, size, false, band),
          ),
        ),
      };
    });
  };
  const gridHeight = (
    fields: DetailField[],
    width: number,
    columns = 2,
    size = 9,
  ) =>
    gridRows(fields, width, columns, size).reduce(
      (height, row) => height + row.height,
      0,
    );
  const rowAt = (
    row: ReturnType<typeof gridRows>[number],
    x: number,
    top: number,
    width: number,
    size: number,
  ) => {
    row.fields.forEach((field, index) =>
      fieldAt(
        field,
        rtl
          ? x + width - row.cellWidth - index * (row.cellWidth + 14)
          : x + index * (row.cellWidth + 14),
        top,
        row.cellWidth,
        size,
        false,
        row.band,
      ),
    );
    return top + row.height;
  };
  const gridAt = (
    fields: DetailField[],
    x: number,
    top: number,
    width: number,
    columns = 2,
    size = 9,
  ) => {
    for (const row of gridRows(fields, width, columns, size))
      top = rowAt(row, x, top, width, size);
    return top;
  };
  const businessName =
    document.identity_snapshot.trade_name ||
    document.identity_snapshot.legal_name;
  const metadata: DetailField[] = [
    {
      label: l.date,
      value: formatDocumentTimestamp(
        document.issued_at ?? document.created_at,
        lang,
      ).date,
      ltr: true,
      icon: "calendar",
    },
    {
      label: l.time,
      value: formatDocumentTimestamp(
        document.issued_at ?? document.created_at,
        lang,
      ).time,
      ltr: true,
      icon: "clock",
    },
    {
      label: l.previewId,
      value: document.id,
      ltr: true,
      wide: layout === "receipt80",
    },
  ];
  const newPage = () => {
    if (pageNo++)
      doc.addPage({
        size: layout === "a4" ? "A4" : [RECEIPT.width, RECEIPT.height],
        margin: 0,
      });
    y = layout === "a4" ? 32 : 20;
    if (pageNo === 1) {
      const businessW = layout === "a4" ? usable * 0.63 : usable;
      const bx = rtl ? margin + usable - businessW : margin;
      const logoW = layout === "a4" ? 155 : 132;
      const logoX =
        layout === "a4"
          ? rtl
            ? margin
            : margin + usable - logoW
          : (doc.page.width - logoW) / 2;
      const logoH = drawPaperBrand(doc, logoX, y, logoW);
      const nameTop = layout === "a4" ? y : y + logoH + 18;
      let businessBottom =
        write(
          businessName,
          bx,
          nameTop,
          businessW,
          layout === "a4" ? 17 : 13.5,
          true,
        ) + 10;
      const profile = profileFields(document);
      const profileH = gridHeight(profile, businessW, 2, 8.2);
      if (
        businessBottom + profileH <
        Math.min(bottom - 150, layout === "a4" ? 470 : 540)
      )
        businessBottom = gridAt(profile, bx, businessBottom, businessW, 2, 8.2);
      else pendingProfile = true;
      y =
        Math.max(businessBottom, (layout === "a4" ? y : nameTop) + logoH) +
        (layout === "a4" ? 8 : 14);
    } else {
      const logoW = layout === "a4" ? 96 : 108;
      const logoX = rtl ? margin : margin + usable - logoW;
      const logoH = drawPaperBrand(doc, logoX, y, logoW);
      const titleW = usable - logoW - 18;
      const titleX = rtl ? margin + logoW + 18 : margin;
      const titleEnd = write(
        `${typeLabel(document)} - ${l.continued}`,
        titleX,
        y,
        titleW,
        layout === "a4" ? 14 : 11,
        true,
      );
      y = Math.max(titleEnd, y + logoH) + 12;
    }
    if (pageNo === 1 && layout === "a4") {
      const badgeW = 156,
        titleW = usable - badgeW - 18;
      const titleX = rtl ? margin + badgeW + 18 : margin;
      const badgeX = rtl ? margin : margin + usable - badgeW;
      const titleEnd = write(typeLabel(document), titleX, y, titleW, 21, true);
      doc
        .save()
        .roundedRect(badgeX, y + 2, badgeW, 23, 3)
        .fillAndStroke(COLORS.paleGold, COLORS.gold)
        .restore();
      write(
        l.draft,
        badgeX + 7,
        y + 8,
        badgeW - 14,
        7.3,
        true,
        false,
        "#6E4C00",
      );
      y = Math.max(titleEnd, y + 25) + 10;
    } else {
      if (pageNo === 1)
        y = write(typeLabel(document), margin, y, usable, 17, true) + 8;
      doc
        .save()
        .roundedRect(margin, y, usable, 23, 3)
        .fillAndStroke(COLORS.paleGold, COLORS.gold)
        .restore();
      write(
        l.draft,
        margin + 7,
        y + 6,
        usable - 14,
        layout === "a4" ? 9 : 7.8,
        true,
        false,
        "#6E4C00",
      );
      y += 34;
    }
    if (pageNo === 1) {
      const metaH = gridHeight(
        metadata,
        usable - 20,
        layout === "a4" ? 3 : 2,
        8,
      );
      doc
        .save()
        .roundedRect(margin, y, usable, metaH + 14, 4)
        .fillAndStroke(COLORS.panel, COLORS.line)
        .restore();
      y =
        gridAt(
          metadata,
          margin + 10,
          y + 8,
          usable - 20,
          layout === "a4" ? 3 : 2,
          8,
        ) + (layout === "a4" ? 8 : 12);
      y =
        write(
          document.number ? `${l.document}: ${document.number}` : l.noNumber,
          margin,
          y,
          usable,
          7.3,
          false,
          false,
          COLORS.muted,
        ) + (layout === "a4" ? 2 : 5);
    } else {
      y =
        gridAt(
          metadata.map((field) => ({ ...field, icon: undefined })),
          margin,
          y,
          usable,
          layout === "a4" ? 3 : 2,
          7.2,
        ) + 4;
    }
    rule(y + 2);
    y += layout === "a4" ? 12 : 17;
  };
  const ensure = (height: number) => {
    if (y + height > bottom) newPage();
  };
  const heading = (icon: PaperIcon, value: string) => {
    ensure(30);
    drawPaperIcon(doc, icon, rtl ? margin + usable - 12 : margin, y + 1);
    y = write(value, rtl ? margin : margin + 18, y, usable - 18, 10, true) + 8;
  };
  const flowingText = (value: string, size = 9, color = COLORS.ink) => {
    for (const line of measure(value, usable, size)) {
      ensure(size * 1.4 + 3);
      y = write(
        line,
        margin,
        y,
        usable,
        size,
        false,
        false,
        color,
        textLanguage(value, lang),
      );
    }
  };
  const flowField = (field: DetailField, size = 9) => {
    ensure(fieldHeight(field, usable, size));
    y = fieldAt(field, margin, y, usable, size);
  };
  const flowGrid = (fields: DetailField[], columns = 2, size = 9) => {
    for (const row of gridRows(fields, usable, columns, size)) {
      ensure(row.height);
      y = rowAt(row, margin, y, usable, size);
    }
  };
  newPage();
  if (pendingProfile) {
    heading("business", l.business);
    flowGrid(profileFields(document), 2, 8.5);
    y += 10;
  }
  const customer = customerFields(document);
  const customerH = gridHeight(customer, usable - 24, 2, 8.8) + 40;
  if (customerH < 400) {
    ensure(customerH + 12);
    const top = y;
    doc
      .save()
      .roundedRect(margin, top, usable, customerH, 5)
      .lineWidth(0.7)
      .stroke(COLORS.line)
      .restore();
    drawPaperIcon(
      doc,
      "customer",
      rtl ? margin + usable - 24 : margin + 12,
      top + 12,
    );
    write(
      l.customer,
      rtl ? margin + 12 : margin + 30,
      top + 11,
      usable - 42,
      9.5,
      true,
    );
    gridAt(customer, margin + 12, top + 34, usable - 24, 2, 8.8);
    y = top + customerH + (layout === "a4" ? 12 : 16);
  } else {
    heading("customer", l.customer);
    flowGrid(customer, 2, 8.8);
    y += 12;
  }

  const columns = [
    { label: l.description, ratio: 0.42 },
    { label: l.quantity, ratio: 0.08 },
    { label: l.net, ratio: 0.17 },
    { label: l.vat, ratio: 0.15 },
    { label: l.gross, ratio: 0.18 },
  ].map((column, index, all) => ({
    ...column,
    width: usable * column.ratio,
    x:
      margin +
      usable *
        (rtl
          ? 1 - all.slice(0, index + 1).reduce((s, c) => s + c.ratio, 0)
          : all.slice(0, index).reduce((s, c) => s + c.ratio, 0)),
  }));
  const tableHeading = () => {
    ensure(46);
    const height =
      Math.max(
        ...columns.map(
          (col) => measure(col.label, col.width - 10, 8, true).length,
        ),
      ) *
        12 +
      12;
    doc.save().rect(margin, y, usable, height).fill(COLORS.panel).restore();
    for (const col of columns)
      write(
        col.label,
        col.x + 5,
        y + 6,
        col.width - 10,
        8,
        true,
        false,
        COLORS.ink,
        undefined,
        col === columns[0] ? align : "right",
      );
    y += height;
  };
  if (layout === "a4") tableHeading();
  for (const item of document.items) {
    if (layout === "receipt80") {
      const fields: DetailField[] = [
        { label: l.quantity, value: String(item.quantity), ltr: true },
        ...itemDetails(item, lang),
        { label: l.net, value: money(item.net_agorot, lang), ltr: true },
        { label: l.vat, value: money(item.vat_agorot, lang), ltr: true },
        {
          label: l.gross,
          value: money(
            item.gross_agorot,
            lang,
            document.type === "credit_note",
          ),
          ltr: true,
        },
      ];
      const itemHeight =
        measure(item.description, usable, 9.5).length * 14.25 +
        18 +
        gridHeight(fields, usable, 2, 8.8);
      // Keep normal thermal-receipt items together; oversized descriptions still
      // flow across pages line-by-line without dropping any content.
      ensure(itemHeight < 550 ? itemHeight : 36);
      flowingText(item.description, 9.5);
      y += 4;
      flowGrid(fields, 2, 8.8);
      rule(y + 3);
      y += 14;
      continue;
    }
    const description = columns[0];
    const meta = itemDetails(item, lang);
    type ItemBlock =
      | { kind: "text"; value: string; height: number }
      | { kind: "fields"; fields: DetailField[]; height: number };
    const blocks: ItemBlock[] = [
      ...measure(item.description, description.width - 10, 8.5).map(
        (value) => ({ kind: "text" as const, value, height: 13 }),
      ),
      ...(meta.length
        ? [
            {
              kind: "fields" as const,
              fields: meta,
              height: gridHeight(meta, description.width - 10, 2, 7.5) + 4,
            },
          ]
        : []),
    ];
    const values = [
      String(item.quantity),
      money(item.net_agorot, lang),
      money(item.vat_agorot, lang),
      money(item.gross_agorot, lang, document.type === "credit_note"),
    ];
    const numericHeight = Math.max(
      ...values.map(
        (value, index) =>
          measure(value, columns[index + 1].width - 10, 8).length * 11.2 + 12,
      ),
    );
    let offset = 0;
    while (offset < blocks.length) {
      const minimumHeight = Math.max(
        38,
        blocks[offset].height + 12,
        offset === 0 ? numericHeight : 0,
      );
      if (y + minimumHeight > bottom) {
        newPage();
        tableHeading();
      }
      let lineY = y + 6,
        count = 0;
      while (
        offset + count < blocks.length &&
        lineY + blocks[offset + count].height + 6 <= bottom
      ) {
        const block = blocks[offset + count];
        if (block.kind === "text")
          write(
            block.value,
            description.x + 5,
            lineY,
            description.width - 10,
            8.5,
            false,
            false,
            COLORS.ink,
            textLanguage(item.description, lang),
          );
        else
          gridAt(
            block.fields,
            description.x + 5,
            lineY + 2,
            description.width - 10,
            2,
            7.5,
          );
        lineY += block.height;
        count++;
      }
      let rowBottom = lineY + 6;
      for (let index = 0; index < values.length; index++) {
        const col = columns[index + 1];
        const valueBottom = write(
          offset === 0 ? values[index] : "-",
          col.x + 5,
          y + 6,
          col.width - 10,
          8,
          false,
          true,
          COLORS.ink,
          undefined,
          "right",
        );
        rowBottom = Math.max(rowBottom, valueBottom + 6);
      }
      y = rowBottom;
      rule(y);
      offset += count;
      if (offset < blocks.length) {
        newPage();
        tableHeading();
      }
    }
  }

  y += 16;
  const summary = summaryFields(document).map((field, index) => ({
      ...field,
      wide: index === 2,
      emphasis: index === 2,
    })),
    summaryW = layout === "a4" ? usable * 0.54 : usable;
  const summaryX =
    layout === "a4" && !rtl ? margin + usable - summaryW : margin;
  const summaryH = 24 + gridHeight(summary, summaryW - 24, 2, 9);
  const paymentFields = document.payment_references.flatMap(
    (payment): DetailField[] => {
      const stamp = payment.collected_at
        ? formatDocumentTimestamp(payment.collected_at, lang)
        : null;
      return [
        { label: l.payment, value: paymentMethod(payment.method, lang) },
        {
          label: l.gross,
          value: money(payment.amount_agorot, lang),
          ltr: true,
        },
        ...(payment.reference
          ? [{ label: l.reference, value: payment.reference }]
          : []),
        ...(stamp
          ? [
              { label: l.date, value: stamp.date, ltr: true },
              { label: l.time, value: stamp.time, ltr: true },
            ]
          : []),
      ];
    },
  );
  const paymentW = layout === "a4" ? usable - summaryW - 20 : usable;
  const paymentH = 28 + gridHeight(paymentFields, paymentW, 2, 8.2);
  const parallelPayments =
    layout === "a4" &&
    paymentFields.length > 0 &&
    Math.max(paymentH, summaryH) < 500;
  ensure(parallelPayments ? Math.max(summaryH, paymentH) : summaryH);
  const summaryTop = y;
  doc
    .save()
    .roundedRect(summaryX, y, summaryW, summaryH, 5)
    .fillAndStroke(COLORS.panel, COLORS.line)
    .restore();
  gridAt(summary, summaryX + 12, y + 12, summaryW - 24, 2, 9);
  if (parallelPayments) {
    const px = rtl ? margin + summaryW + 20 : margin;
    drawPaperIcon(doc, "payment", rtl ? px + paymentW - 12 : px, y + 1);
    const paymentTop =
      write(l.paid, rtl ? px : px + 18, y, paymentW - 18, 9, true) + 10;
    const py = gridAt(paymentFields, px, paymentTop, paymentW, 2, 8.2);
    y = Math.max(summaryTop + summaryH, py) + 18;
  } else {
    y += summaryH + 18;
    if (paymentFields.length) {
      heading("payment", l.paid);
      flowGrid(paymentFields, 2, 8.2);
    }
  }
  if (document.allocation_number)
    flowField({
      label: l.allocation,
      value: document.allocation_number,
      ltr: true,
    });
  if (document.related_document_number)
    flowField({
      label: l.related,
      value: document.related_document_number,
      ltr: true,
    });
  if (document.note) {
    y += 8;
    heading("note", l.note);
    flowingText(document.note, 8, COLORS.muted);
  }
  const pages = doc.bufferedPageRange();
  for (let index = pages.start; index < pages.start + pages.count; index++) {
    doc.switchToPage(index);
    const footerTop = doc.page.height - footerReserve + 12;
    rule(footerTop - 7);
    footerFields.forEach((field, index) => {
      const x = rtl
        ? margin + usable - footerCellW - index * (footerCellW + 16)
        : margin + index * (footerCellW + 16);
      write(
        field.value,
        x,
        footerTop,
        footerCellW,
        6.5,
        false,
        true,
        COLORS.muted,
      );
    });
    write(
      l.page,
      rtl ? margin + usable * 0.5 : margin,
      doc.page.height - 20,
      usable * 0.5,
      6.8,
      false,
      false,
      COLORS.muted,
    );
    write(
      `${index - pages.start + 1} / ${pages.count}`,
      rtl ? margin : margin + usable * 0.5,
      doc.page.height - 20,
      usable * 0.5,
      6.8,
      false,
      true,
      COLORS.muted,
      undefined,
      rtl ? "left" : "right",
    );
  }
  doc.end();
  return completed;
}

export async function renderDraftDocument(
  input: FiscalDocumentSnapshot | ValidatedDocumentSnapshot,
  layout: DocumentLayout,
): Promise<RenderedDraftDocument> {
  const validated =
    "canonicalJson" in input ? input : validateDocumentSnapshot(input);
  const document = validated.document;
  if (document.state === "issued" || document.state === "voided")
    throw new Error(
      "Issued and voided artifacts are immutable; retrieve the stored artifact instead of rendering again",
    );
  const fontBytes = await loadFonts();
  const pdfBytes = await renderLayout(document, layout, fontBytes);
  return {
    pdfBytes,
    accessibleHtml: accessibleHtml(document, layout),
    sourceHash: validated.canonicalHash,
    layout,
    watermark: "DRAFT",
  };
}

export function renderDraftHtml(
  input: FiscalDocumentSnapshot | ValidatedDocumentSnapshot,
  layout: DocumentLayout = "a4",
): string {
  const validated =
    "canonicalJson" in input ? input : validateDocumentSnapshot(input);
  if (
    validated.document.state === "issued" ||
    validated.document.state === "voided"
  )
    throw new Error(
      "Issued artifacts must be retrieved from immutable storage",
    );
  return accessibleHtml(validated.document, layout);
}

export function pdfSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
