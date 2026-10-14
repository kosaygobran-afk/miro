import "server-only";
import PDFDocument from "pdfkit";
import type * as PDFKit from "pdfkit";
import bidiFactory from "bidi-js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateDocumentSnapshot } from "./snapshot";
import type {
  FiscalDocumentSnapshot,
  DocumentLanguage,
  ValidatedDocumentSnapshot,
} from "./types";

const RECEIPT = { width: 226.77, height: 841.89 };
const bidi = bidiFactory();
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

function uniqueLines(lines: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  return lines.filter((line): line is string => {
    if (!line?.trim() || seen.has(line)) return false;
    seen.add(line);
    return true;
  });
}

function legalBusinessLines(
  identity: FiscalDocumentSnapshot["identity_snapshot"],
  l: Record<string, string>,
): string[] {
  if (identity.trade_name && identity.trade_name !== identity.legal_name) {
    return [
      `${l.tradeName}: ${identity.trade_name}`,
      `${l.legalName}: ${identity.legal_name}`,
    ];
  }
  return [`${l.legalName}: ${identity.legal_name}`];
}

function businessLegalDetail(
  identity: FiscalDocumentSnapshot["identity_snapshot"],
  l: Record<string, string>,
): string {
  return identity.trade_name && identity.trade_name !== identity.legal_name
    ? `${l.legalName}: ${identity.legal_name}`
    : "";
}

function customerDetailLines(
  customer: FiscalDocumentSnapshot["customer_snapshot"],
  l: Record<string, string>,
): string[] {
  return uniqueLines([
    customer.company_name && customer.company_name !== customer.name
      ? customer.company_name
      : "",
    customer.registration_number
      ? `${l.registration}: ${customer.registration_number}`
      : "",
    fullAddress(customer.address),
    customer.phone,
    customer.email,
  ]);
}

function typeLabel(document: FiscalDocumentSnapshot): string {
  return labels(document.identity_snapshot.document_language)[document.type];
}

function accessibleHtml(document: FiscalDocumentSnapshot): string {
  const lang = document.identity_snapshot.document_language;
  const rtl = lang === "he";
  const l = labels(lang);
  const direction = rtl ? "rtl" : "ltr";
  const itemRows = document.items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.description)}</td><td>${item.quantity}</td><td>${escapeHtml(money(item.net_agorot, lang))}</td><td>${escapeHtml(money(item.vat_agorot, lang))}</td><td>${escapeHtml(money(item.gross_agorot, lang, document.type === "credit_note"))}</td></tr>`,
    )
    .join("");
  const payments = document.payment_references
    .map(
      (p) =>
        `<li>${escapeHtml(p.method)}: ${escapeHtml(money(p.amount_agorot, lang))}${p.reference ? ` (${escapeHtml(p.reference)})` : ""}</li>`,
    )
    .join("");
  const identity = document.identity_snapshot;
  const identityLines = [
    ...legalBusinessLines(identity, l),
    identity.registration_number
      ? `${l.registration}: ${identity.registration_number}`
      : "",
    identity.vat_number ? `${l.vatNumber}: ${identity.vat_number}` : "",
    fullAddress(identity.address),
    identity.phone,
    identity.email,
  ].filter((line): line is string => Boolean(line));
  const customerLines = [
    document.customer_snapshot.name,
    ...customerDetailLines(document.customer_snapshot, l),
  ];
  const docRef = document.number
    ? `${l.document} ${document.number}`
    : `${l.noNumber} (${document.id})`;
  return `<!doctype html><html lang="${lang}" dir="${direction}"><head><meta charset="utf-8"><title>${escapeHtml(typeLabel(document))} - ${escapeHtml(docRef)}</title><style>body{font:16px/1.55 system-ui,sans-serif;color:#17202a;max-width:920px;margin:2rem auto;padding:0 1rem}h1{font-size:1.6rem} .draft{display:inline-block;padding:.5rem 1rem;border:2px solid #b58927;background:#fff4d3;font-weight:700} table{width:100%;border-collapse:collapse;margin:1.5rem 0}th,td{border-bottom:1px solid #d8dee6;padding:.55rem;text-align:start;vertical-align:top}tfoot th{text-align:end}.details{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}address{font-style:normal} .total{font-size:1.25rem;font-weight:700}</style></head><body><p class="draft">${escapeHtml(l.draft)}</p><h1>${escapeHtml(typeLabel(document))}</h1><p>${escapeHtml(docRef)}</p><p>${escapeHtml(l.date)}: <time datetime="${escapeHtml(document.issued_at ?? document.created_at)}">${escapeHtml(document.issued_at ?? document.created_at)}</time></p><div class="details"><section><h2>${escapeHtml(l.business)}</h2><address>${identityLines.map(escapeHtml).join("<br>")}</address></section><section><h2>${escapeHtml(l.customer)}</h2><address>${customerLines.map(escapeHtml).join("<br>")}</address></section></div><table><thead><tr><th scope="col">${escapeHtml(l.description)}</th><th scope="col">${escapeHtml(l.quantity)}</th><th scope="col">${escapeHtml(l.net)}</th><th scope="col">${escapeHtml(l.vat)}</th><th scope="col">${escapeHtml(l.gross)}</th></tr></thead><tbody>${itemRows}</tbody><tfoot><tr><th colspan="4">${escapeHtml(l.net)}</th><td>${escapeHtml(money(document.net_agorot, lang))}</td></tr><tr><th colspan="4">${escapeHtml(l.vat)}</th><td>${escapeHtml(money(document.vat_agorot, lang))}</td></tr><tr class="total"><th colspan="4">${escapeHtml(document.type === "credit_note" ? l.credit : l.total)}</th><td>${escapeHtml(money(document.total_agorot, lang, document.type === "credit_note"))}</td></tr></tfoot></table>${payments ? `<section><h2>${escapeHtml(l.paid)}</h2><ul>${payments}</ul></section>` : ""}${document.allocation_number ? `<p>${escapeHtml(l.allocation)}: ${escapeHtml(document.allocation_number)}</p>` : ""}${document.related_document_number ? `<p>${escapeHtml(l.related)}: ${escapeHtml(document.related_document_number)}</p>` : ""}${document.note ? `<section><h2>${escapeHtml(l.note)}</h2><p>${escapeHtml(document.note)}</p></section>` : ""}</body></html>`;
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
        for (const grapheme of Array.from(word)) {
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
  const tokens = text.match(/\s+|[^\s]+/gu) ?? [];
  if (!/[\u0590-\u05ff]/u.test(text)) return tokens;
  const embedding = bidi.getEmbeddingLevels(
    text,
    language === "he" ? "rtl" : "ltr",
  );
  const levels: number[] = [];
  let offset = 0;
  for (const token of tokens) {
    const tokenLevels = Array.from(
      embedding.levels.slice(offset, offset + token.length),
    );
    const level = token.trim()
      ? Math.max(...tokenLevels)
      : (tokenLevels[0] ?? 0);
    levels.push(level);
    offset += token.length;
  }

  // Apply UAX #9's level-run reversal to whitespace-delimited tokens, not
  // characters. PDFKit/fontkit shapes each Hebrew token itself, so this moves
  // words into visual order without reversing the glyphs inside a word.
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
  tokens.forEach((token, index) => {
    doc.text(token, cursor, y, { lineBreak: false });
    cursor += tokenWidths[index];
  });
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

function addPage(
  doc: PDFKit.PDFDocument,
  document: FiscalDocumentSnapshot,
  layout: DocumentLayout,
  pageNumber: number,
): number {
  if (pageNumber > 1)
    doc.addPage({
      size: layout === "a4" ? "A4" : [RECEIPT.width, RECEIPT.height],
      margin: 0,
    });
  const lang = document.identity_snapshot.document_language;
  const l = labels(lang);
  const pageWidth = doc.page.width;
  const margin = layout === "a4" ? 38 : 18;
  const usable = pageWidth - margin * 2;
  const align = lang === "he" ? "right" : "left";
  doc.save().fillColor(COLORS.paleGold).rect(margin, 26, usable, 31).fill();
  doc.restore();
  doc
    .rect(margin, 26, usable, 31)
    .strokeColor(COLORS.gold)
    .lineWidth(1.2)
    .stroke();
  drawText(doc, l.draft, margin + 8, 34, usable - 16, {
    fontSize: layout === "a4" ? 13 : 10,
    bold: true,
    color: "#6E4C00",
    align,
    language: lang,
    lineHeight: 16,
  });
  const businessName =
    document.identity_snapshot.trade_name ||
    document.identity_snapshot.legal_name;
  const y = drawText(doc, businessName, margin, 68, usable, {
    fontSize: layout === "a4" ? 16 : 13,
    bold: true,
    align,
    language: lang,
    lineHeight: 20,
  });
  let titleTop = y + 2;
  if (layout === "receipt80") {
    const business = document.identity_snapshot;
    const businessLines = [
      businessLegalDetail(business, l),
      business.registration_number
        ? `${l.registration}: ${business.registration_number}`
        : "",
      business.vat_number ? `${l.vatNumber}: ${business.vat_number}` : "",
      fullAddress(business.address),
      business.phone ? `${l.phone}: ${business.phone}` : "",
      business.email,
    ].filter(Boolean);
    if (businessLines.length) {
      titleTop =
        drawText(doc, businessLines.join("\n"), margin, titleTop, usable, {
          fontSize: 7.2,
          color: COLORS.muted,
          align,
          language: lang,
          lineHeight: 10,
        }) + 3;
    }
  }
  const titleY = drawText(doc, typeLabel(document), margin, titleTop, usable, {
    fontSize: layout === "a4" ? 14 : 12,
    bold: true,
    align,
    language: lang,
    lineHeight: 18,
  });
  if (pageNumber === 1) {
    const ref = document.number
      ? `${l.document}: ${document.number}`
      : `${l.noNumber}: ${document.id}`;
    const refBottom = drawText(doc, ref, margin, titleY + 1, usable, {
      fontSize: 9,
      color: COLORS.muted,
      align,
      language: lang,
      lineHeight: 14,
    });
    const dateY = layout === "receipt80" ? refBottom + 1 : titleY + 16;
    const dateBottom = drawText(
      doc,
      `${l.date}: ${document.issued_at ?? document.created_at}`,
      margin,
      dateY,
      usable,
      {
        fontSize: 9,
        color: COLORS.muted,
        align,
        language: lang,
        lineHeight: 14,
      },
    );
    if (layout === "a4") {
      const colGap = 16;
      const colWidth = (usable - colGap) / 2;
      const detailTop = titleY + 45;
      const business = document.identity_snapshot;
      const businessLines = [
        businessLegalDetail(business, l),
        business.registration_number
          ? `${l.registration}: ${business.registration_number}`
          : "",
        business.vat_number ? `${l.vatNumber}: ${business.vat_number}` : "",
        fullAddress(business.address),
        business.phone,
        business.email,
      ].filter(Boolean);
      const customer = document.customer_snapshot;
      const customerLines = customerDetailLines(customer, l);
      const firstX = lang === "he" ? margin + colWidth + colGap : margin;
      const secondX = lang === "he" ? margin : margin + colWidth + colGap;
      drawText(doc, l.business, firstX, detailTop, colWidth, {
        fontSize: 10,
        bold: true,
        align,
        language: lang,
        lineHeight: 15,
      });
      drawText(
        doc,
        businessLines.join("\n"),
        firstX,
        detailTop + 16,
        colWidth,
        {
          fontSize: 8.5,
          color: COLORS.muted,
          align,
          language: lang,
          lineHeight: 12,
        },
      );
      drawText(
        doc,
        `${l.customer}: ${customer.name}`,
        secondX,
        detailTop,
        colWidth,
        { fontSize: 10, bold: true, align, language: lang, lineHeight: 15 },
      );
      drawText(
        doc,
        customerLines.join("\n"),
        secondX,
        detailTop + 16,
        colWidth,
        {
          fontSize: 8.5,
          color: COLORS.muted,
          align,
          language: lang,
          lineHeight: 12,
        },
      );
      return (
        detailTop +
        16 +
        Math.max(businessLines.length, customerLines.length, 1) * 12 +
        24
      );
    }
    const customerY = layout === "receipt80" ? dateBottom + 3 : titleY + 34;
    drawText(
      doc,
      `${l.customer}: ${document.customer_snapshot.name}`,
      margin,
      customerY,
      usable,
      { fontSize: 9, bold: true, align, language: lang, lineHeight: 14 },
    );
    if (layout === "receipt80") {
      const customerLines = customerDetailLines(document.customer_snapshot, l);
      const detailsEnd = customerLines.length
        ? drawText(
            doc,
            customerLines.join("\n"),
            margin,
            customerY + 15,
            usable,
            {
              fontSize: 7.2,
              color: COLORS.muted,
              align,
              language: lang,
              lineHeight: 10,
            },
          )
        : customerY + 15;
      return detailsEnd + 8;
    }
    return titleY + 60;
  }
  return titleY + 8;
}

function drawTableHeading(
  doc: PDFKit.PDFDocument,
  layout: DocumentLayout,
  y: number,
  margin: number,
  usable: number,
  lang: DocumentLanguage,
): number {
  const l = labels(lang);
  const headingHeight = 25;
  doc
    .save()
    .fillColor(COLORS.panel)
    .rect(margin, y, usable, headingHeight)
    .fill();
  doc.restore();
  const cols =
    layout === "a4"
      ? [
          { key: "description", label: l.description, width: usable * 0.5 },
          { key: "quantity", label: l.quantity, width: usable * 0.1 },
          { key: "net", label: l.net, width: usable * 0.14 },
          { key: "vat", label: l.vat, width: usable * 0.12 },
          { key: "gross", label: l.gross, width: usable * 0.14 },
        ]
      : [
          { key: "description", label: l.description, width: usable * 0.56 },
          { key: "gross", label: l.gross, width: usable * 0.44 },
        ];
  const physical = lang === "he" ? [...cols].reverse() : cols;
  let x = margin;
  for (const col of physical) {
    const columnAlign =
      col.key === "description" ? (lang === "he" ? "right" : "left") : "right";
    drawText(doc, col.label, x + 3, y + 7, col.width - 6, {
      fontSize: layout === "a4" ? 8 : 8,
      bold: true,
      align: columnAlign,
      language: lang,
      lineHeight: 12,
    });
    x += col.width;
  }
  return y + headingHeight;
}

function renderLayout(
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
      CreationDate: new Date(document.created_at),
      ModDate: new Date(document.created_at),
    },
  });
  doc
    .registerFont("NotoRegular", fonts.regular)
    .registerFont("NotoBold", fonts.bold);
  const lang = document.identity_snapshot.document_language;
  const l = labels(lang);
  const align = lang === "he" ? "right" : "left";
  const margin = layout === "a4" ? 38 : 18;
  const usable = doc.page.width - margin * 2;
  let pageNo = 1;
  let y = addPage(doc, document, layout, pageNo);
  y = drawTableHeading(doc, layout, y, margin, usable, lang);
  const lineHeight = layout === "a4" ? 12 : 13;
  for (const item of document.items) {
    const descriptions = wrapText(
      doc.font("NotoRegular").fontSize(layout === "a4" ? 8.5 : 9),
      item.description,
      layout === "a4" ? usable * 0.5 - 8 : usable * 0.56 - 8,
      layout === "a4" ? 8.5 : 9,
    );
    const rowHeight = Math.max(24, descriptions.length * lineHeight + 12);
    if (y + rowHeight > doc.page.height - 66) {
      pageNo++;
      y = addPage(doc, document, layout, pageNo);
      y = drawTableHeading(doc, layout, y, margin, usable, lang);
    }
    const descriptionWidth = layout === "a4" ? usable * 0.5 : usable * 0.56;
    const amountWidth =
      layout === "a4"
        ? [usable * 0.1, usable * 0.14, usable * 0.12, usable * 0.14]
        : [usable * 0.44];
    let values =
      layout === "a4"
        ? [
            item.quantity.toLocaleString(lang === "he" ? "he-IL" : "en-IL"),
            money(item.net_agorot, lang),
            money(item.vat_agorot, lang),
            money(item.gross_agorot, lang, document.type === "credit_note"),
          ]
        : [money(item.gross_agorot, lang, document.type === "credit_note")];
    const langIsRtl = lang === "he";
    const descriptionX = langIsRtl
      ? margin + usable - descriptionWidth
      : margin;
    drawText(
      doc,
      item.description,
      descriptionX + 4,
      y + 6,
      descriptionWidth - 8,
      {
        fontSize: layout === "a4" ? 8.5 : 9,
        align: langIsRtl ? "right" : "left",
        language: lang,
        lineHeight,
      },
    );
    if (layout === "a4" && langIsRtl) values = [...values].reverse();
    let colX = langIsRtl ? margin : margin + descriptionWidth;
    for (let i = 0; i < values.length; i++) {
      const width =
        layout === "a4" && langIsRtl
          ? [usable * 0.14, usable * 0.12, usable * 0.14, usable * 0.1][i]
          : amountWidth[i];
      drawText(doc, values[i], colX + 2, y + 6, width - 4, {
        fontSize: layout === "a4" ? 7.3 : 8.2,
        align: "right",
        language: lang,
        lineHeight: 11,
      });
      colX += width;
    }
    y += rowHeight;
    doc
      .moveTo(margin, y)
      .lineTo(margin + usable, y)
      .strokeColor(COLORS.line)
      .lineWidth(0.6)
      .stroke();
  }

  const summaryHeight = layout === "a4" ? 111 : 125;
  if (y + summaryHeight > doc.page.height - 54) {
    pageNo++;
    y = addPage(doc, document, layout, pageNo) + 10;
  }
  y += 12;
  const summaryX = layout === "a4" ? margin + usable * 0.48 : margin;
  const summaryW = usable - (summaryX - margin);
  const summaryRows = [
    [l.net, money(document.net_agorot, lang)],
    [l.vat, money(document.vat_agorot, lang)],
    [
      document.type === "credit_note" ? l.credit : l.total,
      money(document.total_agorot, lang, document.type === "credit_note"),
    ],
  ];
  doc
    .save()
    .fillColor(COLORS.panel)
    .roundedRect(summaryX, y, summaryW, summaryHeight, 5)
    .fill();
  doc.restore();
  let sy = y + 10;
  for (let i = 0; i < summaryRows.length; i++) {
    const [name, amount] = summaryRows[i];
    drawText(doc, name, summaryX + 9, sy, summaryW * 0.47, {
      fontSize: i === 2 ? 10 : 8.5,
      bold: i === 2,
      align: lang === "he" ? "right" : "left",
      language: lang,
      lineHeight: 15,
    });
    drawText(doc, amount, summaryX + summaryW * 0.48, sy, summaryW * 0.48 - 8, {
      fontSize: i === 2 ? 10 : 8.5,
      bold: i === 2,
      align: "right",
      language: lang,
      lineHeight: 15,
    });
    sy += i === 2 ? 23 : 18;
  }
  const recordedPayments = document.payment_references.reduce(
    (sum, p) => sum + p.amount_agorot,
    0,
  );
  if (recordedPayments > 0) {
    drawText(
      doc,
      `${l.paid}: ${money(recordedPayments, lang)}`,
      summaryX + 9,
      sy + 1,
      summaryW - 18,
      {
        fontSize: 8,
        color: COLORS.muted,
        align,
        language: lang,
        lineHeight: 12,
      },
    );
    sy += 15;
    if (recordedPayments < document.total_agorot)
      drawText(
        doc,
        `${l.balance}: ${money(document.total_agorot - recordedPayments, lang)}`,
        summaryX + 9,
        sy,
        summaryW - 18,
        {
          fontSize: 8,
          color: COLORS.muted,
          align,
          language: lang,
          lineHeight: 12,
        },
      );
  }
  y += summaryHeight + 12;
  if (document.payment_references.length > 0) {
    if (y + 28 > doc.page.height - 45) {
      pageNo++;
      y = addPage(doc, document, layout, pageNo) + 10;
    }
    drawText(doc, l.payment, margin, y, usable, {
      fontSize: 8.5,
      bold: true,
      align,
      language: lang,
      lineHeight: 13,
    });
    y += 14;
    for (const payment of document.payment_references) {
      const detail = `${payment.method}${payment.reference ? ` - ${payment.reference}` : ""}: ${money(payment.amount_agorot, lang)}`;
      const lines = wrapText(doc, detail, usable, 8);
      const blockHeight = lines.length * 12;
      if (y + blockHeight > doc.page.height - 45) {
        pageNo++;
        y = addPage(doc, document, layout, pageNo) + 10;
      }
      y = drawText(doc, detail, margin, y, usable, {
        fontSize: 8,
        color: COLORS.muted,
        align,
        language: lang,
        lineHeight: 12,
      });
    }
  }
  if (document.allocation_number) {
    if (y + 28 > doc.page.height - 45) {
      pageNo++;
      y = addPage(doc, document, layout, pageNo) + 10;
    }
    y = drawText(
      doc,
      `${l.allocation}: ${document.allocation_number}`,
      margin,
      y + 7,
      usable,
      { fontSize: 9, bold: true, align, language: lang, lineHeight: 14 },
    );
  }
  if (document.related_document_number)
    y = drawText(
      doc,
      `${l.related}: ${document.related_document_number}`,
      margin,
      y + 7,
      usable,
      {
        fontSize: 8,
        color: COLORS.muted,
        align,
        language: lang,
        lineHeight: 12,
      },
    );
  if (document.note) {
    if (y + 30 > doc.page.height - 45) {
      pageNo++;
      y = addPage(doc, document, layout, pageNo) + 10;
    }
    drawText(doc, `${l.note}: ${document.note}`, margin, y + 8, usable, {
      fontSize: 8,
      color: COLORS.muted,
      align,
      language: lang,
      lineHeight: 12,
    });
  }
  const pages = doc.bufferedPageRange();
  for (let index = pages.start; index < pages.start + pages.count; index++) {
    doc.switchToPage(index);
    const footerY = doc.page.height - 35;
    doc
      .moveTo(margin, footerY - 5)
      .lineTo(doc.page.width - margin, footerY - 5)
      .strokeColor(COLORS.line)
      .lineWidth(0.6)
      .stroke();
    drawText(
      doc,
      `${l.page} ${index - pages.start + 1} / ${pages.count}`,
      margin,
      footerY,
      usable,
      {
        fontSize: 7.5,
        color: COLORS.muted,
        align: "center",
        language: lang,
        lineHeight: 10,
      },
    );
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.once("error", reject);
    doc.once("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.end();
  });
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
    accessibleHtml: accessibleHtml(document),
    sourceHash: validated.canonicalHash,
    layout,
    watermark: "DRAFT",
  };
}

export function renderDraftHtml(
  input: FiscalDocumentSnapshot | ValidatedDocumentSnapshot,
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
  return accessibleHtml(validated.document);
}

export function pdfSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
