export const MAX_CATEGORY_ARTWORK_SVG_BYTES = 32 * 1024;
export const MAX_CATEGORY_ARTWORK_PHOTO_BYTES = 4 * 1024 * 1024;

export type StorefrontCategoryArtwork = {
  imageUrl: string | null;
  iconUrl: string | null;
};

const presentation = [
  "id",
  "fill",
  "fill-rule",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "opacity",
  "clip-path",
  "clip-rule",
  "transform",
];
const gradient = ["id", "gradientUnits", "gradientTransform", "spreadMethod"];
const attributes = {
  svg: [
    "xmlns",
    "viewBox",
    "width",
    "height",
    "preserveAspectRatio",
    ...presentation,
  ],
  g: presentation,
  path: ["d", ...presentation],
  rect: ["x", "y", "width", "height", "rx", "ry", ...presentation],
  circle: ["cx", "cy", "r", ...presentation],
  ellipse: ["cx", "cy", "rx", "ry", ...presentation],
  line: ["x1", "y1", "x2", "y2", ...presentation],
  polyline: ["points", ...presentation],
  polygon: ["points", ...presentation],
  defs: [],
  linearGradient: ["x1", "y1", "x2", "y2", ...gradient],
  radialGradient: ["cx", "cy", "r", "fx", "fy", "fr", ...gradient],
  stop: ["offset", "stop-color", "stop-opacity"],
  clipPath: ["id", "clipPathUnits", "transform"],
};
type SvgElement = keyof typeof attributes;

const svgNamespace = "http://www.w3.org/2000/svg";
const identifier = /^[A-Za-z_][\w-]{0,63}$/;
const fragment = /^url\(#[A-Za-z_][\w-]{0,63}\)$/;
const numberPattern = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
const numberRegex = new RegExp(`^${numberPattern}$`);
const dimensionRegex = new RegExp(`^(${numberPattern})(px|%)?$`);
const graphicElements = new Set([
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
]);

function isBoundedNumber(value: string, minimum = -100_000, maximum = 100_000) {
  const number = Number(value);
  return numberRegex.test(value) && number >= minimum && number <= maximum;
}

function numbers(value: string) {
  return value.trim().split(/\s*,\s*|\s+/);
}

function isColor(value: string) {
  return (
    /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|[a-z][a-z-]{0,30})$/i.test(
      value,
    ) || /^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-/]+\)$/.test(value)
  );
}

function isTransform(value: string) {
  const action =
    /\s*(matrix|translate|scale|rotate|skewX|skewY)\(([^()]*)\)\s*,?\s*/gy;
  let count = 0;
  while (action.lastIndex < value.length) {
    const match = action.exec(value);
    if (!match || ++count > 12) return false;
    const operands = numbers(match[2]);
    if (
      operands.length > 6 ||
      !operands.every((operand) => isBoundedNumber(operand))
    )
      return false;
  }
  return count > 0;
}

function isAllowedValue(name: string, value: string, tag: SvgElement): boolean {
  if (name === "xmlns") return value === svgNamespace;
  if (name === "id") return identifier.test(value);
  if (name === "fill" || name === "stroke")
    return isColor(value) || fragment.test(value);
  if (name === "stop-color") return isColor(value);
  if (name === "clip-path") return value === "none" || fragment.test(value);
  if (name === "fill-rule" || name === "clip-rule")
    return /^(nonzero|evenodd)$/.test(value);
  if (name === "stroke-linecap") return /^(butt|round|square)$/.test(value);
  if (name === "stroke-linejoin") return /^(miter|round|bevel)$/.test(value);
  if (name === "preserveAspectRatio")
    return /^(none|x(Min|Mid|Max)Y(Min|Mid|Max)( (meet|slice))?)$/.test(value);
  if (name === "clipPathUnits" || name === "gradientUnits")
    return /^(userSpaceOnUse|objectBoundingBox)$/.test(value);
  if (name === "spreadMethod") return /^(pad|reflect|repeat)$/.test(value);
  if (name === "transform" || name === "gradientTransform")
    return isTransform(value);
  if (name === "viewBox") {
    const [x, y, width, height, ...extra] = numbers(value);
    return (
      extra.length === 0 &&
      [x, y, width, height].every((part) => part && isBoundedNumber(part)) &&
      Number(width) > 0 &&
      Number(height) > 0
    );
  }
  if (name === "d") {
    if (!/^[\s,\dEe.+\-MmZzLlHhVvCcSsQqTtAa]+$/.test(value)) return false;
    const coordinates = value.match(new RegExp(numberPattern, "g")) ?? [];
    return (
      coordinates.length > 0 &&
      coordinates.every((coordinate) => isBoundedNumber(coordinate))
    );
  }
  if (name === "points" || name === "stroke-dasharray") {
    return (
      (name === "stroke-dasharray" && value === "none") ||
      numbers(value).every((part) => isBoundedNumber(part))
    );
  }
  const dimension = dimensionRegex.exec(value);
  if (!dimension) return false;
  if (tag === "svg" && (name === "width" || name === "height")) {
    return (
      Number(dimension[1]) > 0 &&
      Number(dimension[1]) <= (dimension[2] === "%" ? 100 : 4096)
    );
  }
  return isBoundedNumber(dimension[1]);
}

function canNest(tag: SvgElement, parent: SvgElement) {
  if (parent === "svg" || parent === "g" || parent === "clipPath") {
    return graphicElements.has(tag) || (parent === "svg" && tag === "defs");
  }
  if (parent === "defs")
    return (
      tag === "linearGradient" || tag === "radialGradient" || tag === "clipPath"
    );
  return (
    (parent === "linearGradient" || parent === "radialGradient") &&
    tag === "stop"
  );
}

/** Rebuild a bounded, graphics-only SVG from permitted elements and values. */
export function normalizeCategoryArtworkSvg(source: string): string | null {
  if (
    source.length > MAX_CATEGORY_ARTWORK_SVG_BYTES ||
    new TextEncoder().encode(source).byteLength > MAX_CATEGORY_ARTWORK_SVG_BYTES
  )
    return null;
  const input = source
    .trim()
    .replace(
      /^<\?xml\s+version\s*=\s*(?:"1\.0"|'1\.0')(?:\s+encoding\s*=\s*(?:"UTF-8"|'UTF-8'))?\s*\?>/i,
      "",
    );
  const whitespace = /[ \t\r\n]*/y;
  const closingTag = /<\/([A-Za-z][A-Za-z0-9]*)[ \t\r\n]*>/y;
  const openingTag = /<([A-Za-z][A-Za-z0-9]*)([ \t\r\n][^<>]*?)?(\/?)>/y;
  const attribute =
    /[ \t\r\n]+([a-zA-Z][a-zA-Z0-9-]*)[ \t\r\n]*=[ \t\r\n]*(?:"([^"<>&]*)"|'([^'<>&]*)')/y;
  const stack: SvgElement[] = [];
  const output: string[] = [];
  const ids = new Set<string>();
  let offset = 0;
  let tags = 0;
  let hasArtwork = false;

  while (offset < input.length) {
    whitespace.lastIndex = offset;
    whitespace.exec(input);
    offset = whitespace.lastIndex;
    if (offset === input.length) break;
    if (input.startsWith("<!--", offset)) {
      const end = input.indexOf("-->", offset + 4);
      if (end === -1) return null;
      offset = end + 3;
      continue;
    }
    closingTag.lastIndex = offset;
    const close = closingTag.exec(input);
    if (close) {
      if (stack.pop() !== close[1]) return null;
      output.push(`${"  ".repeat(stack.length)}</${close[1]}>`);
      offset = closingTag.lastIndex;
      continue;
    }
    openingTag.lastIndex = offset;
    const open = openingTag.exec(input);
    if (
      !open ||
      !Object.hasOwn(attributes, open[1]) ||
      ++tags > 400 ||
      stack.length >= 20
    )
      return null;
    const tag = open[1] as SvgElement;
    const parent = stack.at(-1);
    if (parent ? !canNest(tag, parent) : tag !== "svg" || tags !== 1 || open[3])
      return null;
    if (tag !== "g" && graphicElements.has(tag) && !stack.includes("defs")) {
      hasArtwork = true;
    }

    const rawAttributes = (open[2] ?? "").trimEnd();
    const allowedAttributes: readonly string[] = attributes[tag];
    const elementAttributes = new Map<string, string>();
    attribute.lastIndex = 0;
    while (attribute.lastIndex < rawAttributes.length) {
      const match = attribute.exec(rawAttributes);
      if (!match) return null;
      const name = match[1];
      const value = (match[2] ?? match[3]).trim();
      if (
        !allowedAttributes.includes(name) ||
        elementAttributes.has(name) ||
        !isAllowedValue(name, value, tag)
      )
        return null;
      if (name === "clip-path" && stack.includes("clipPath")) return null;
      if (name === "id") {
        if (ids.has(value)) return null;
        ids.add(value);
      }
      elementAttributes.set(name, value);
    }
    if (tag === "svg") {
      if (!elementAttributes.has("viewBox")) return null;
      elementAttributes.set("xmlns", svgNamespace);
    }
    const serializedAttributes = Array.from(
      elementAttributes,
      ([name, value]) => ` ${name}="${value}"`,
    ).join("");
    output.push(
      `${"  ".repeat(stack.length)}<${tag}${serializedAttributes}${open[3]}>`,
    );
    if (!open[3]) stack.push(tag);
    offset = openingTag.lastIndex;
  }
  const svg = output.join("\n");
  return hasArtwork &&
    stack.length === 0 &&
    svg.length <= MAX_CATEGORY_ARTWORK_SVG_BYTES
    ? svg
    : null;
}

/** Only use the returned URL as an image source. Source code is never DOM markup. */
export function createCategoryArtworkIconUrl(
  source: string | null,
): string | null {
  if (!source) return null;
  const svg = normalizeCategoryArtworkSvg(source);
  return svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : null;
}
