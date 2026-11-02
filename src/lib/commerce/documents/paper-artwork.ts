import artwork from "@/components/brand/artwork.json";
import type * as PDFKit from "pdfkit";

/** One fixed vector master for HTML and PDF; no remote images or font logos. */
export const PAPER_TEMPLATE_VERSION = "miro-draft-3";
export const PAPER_ICONS = {
  business:
    "M3 21V3H15V21M15 9H21V21M1 21H23M6 7H8M10 7H12M6 11H8M10 11H12M6 15H8M10 15H12M18 13H19M18 17H19",
  customer: "M8 7A4 4 0 1 0 16 7A4 4 0 1 0 8 7M4 22V19C4 12 20 12 20 19V22",
  calendar:
    "M5 4H19Q21 4 21 6V20Q21 22 19 22H5Q3 22 3 20V6Q3 4 5 4M7 1V7M17 1V7M3 10H21",
  clock: "M2 12A10 10 0 1 0 22 12A10 10 0 1 0 2 12M12 6V12L16 15",
  payment:
    "M3 4H21Q23 4 23 6V18Q23 20 21 20H3Q1 20 1 18V6Q1 4 3 4M1 9H23M5 15H10",
  note: "M5 2H15L21 8V22H5ZM15 2V8H21M9 12H17M9 16H17",
} as const;
export type PaperIcon = keyof typeof PAPER_ICONS;

export function paperIconSvg(icon: PaperIcon): string {
  return `<svg class="paper-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><path d="${PAPER_ICONS[icon]}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function paperBrandSvg(): string {
  return `<svg class="paper-brand" viewBox="${artwork.viewBox}" role="img" aria-label="MIRO Group / מירו גרופ" xmlns="http://www.w3.org/2000/svg">${artwork.wordmark.map((p) => `<path d="${p.d}" fill="${p.accent ? artwork.gold : "#17202a"}"/>`).join("")}<g fill="#17202a">${artwork.caption.map((p) => `<path d="${p.d}" transform="${p.transform}"/>`).join("")}</g></svg>`;
}

/** Static paper rules remain SVG paths, while all variable content stays text. */
export const PAPER_RULE_SVG =
  '<svg class="paper-rule" viewBox="0 0 1000 4" preserveAspectRatio="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M0 0H1000V1H0Z" fill="#d8dee6"/><path d="M0 0H100V4H0Z" fill="#b58927"/></svg>';

export function drawPaperBrand(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
): number {
  const [, minY, viewWidth, height] = artwork.viewBox.split(" ").map(Number);
  const scale = width / viewWidth;
  doc.save().translate(x, y).scale(scale).translate(0, -minY);
  for (const p of artwork.wordmark)
    doc.path(p.d).fill(p.accent ? artwork.gold : "#17202a");
  for (const p of artwork.caption) {
    const values = p.transform.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    doc.save().transform(values[2], 0, 0, values[3], values[0], values[1]);
    doc.path(p.d).fill("#17202a");
    doc.restore();
  }
  doc.restore();
  return height * scale;
}

export function drawPaperIcon(
  doc: PDFKit.PDFDocument,
  icon: PaperIcon,
  x: number,
  y: number,
  size = 12,
) {
  doc
    .save()
    .translate(x, y)
    .scale(size / 24);
  doc
    .path(PAPER_ICONS[icon])
    .lineWidth(1.5)
    .lineCap("round")
    .lineJoin("round")
    .stroke("#596574");
  doc.restore();
}
