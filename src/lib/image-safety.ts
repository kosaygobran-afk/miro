import "server-only";

// Media safety for the product-media storage bucket (migration
// 20260927230000_services_media.sql): size cap mirrors the bucket's
// file_size_limit, uploads are content-sniffed, and SVG is sanitized
// conservatively (reject on dangerous constructs rather than rewriting them).

export const PRODUCT_MEDIA_BUCKET = "product-media";
// Must match storage.buckets.file_size_limit for product-media (5 MB).
export const PRODUCT_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

// Category icon upload: separate bucket/path, 1 MB max, owned path categories/<uuid>/<uuid>.<ext>
export const CATEGORY_ICON_BUCKET = "product-media"; // Same bucket, different prefix
export const CATEGORY_ICON_MAX_BYTES = 1 * 1024 * 1024;

export type SniffedImageType = "jpeg" | "png" | "webp" | "avif" | "svg";

export const IMAGE_MIME_BY_TYPE: Record<SniffedImageType, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

export const EXTENSION_BY_TYPE: Record<SniffedImageType, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  avif: "avif",
  svg: "svg",
};

const EXTENSION_TO_TYPE: Record<string, SniffedImageType> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  avif: "avif",
  svg: "svg",
};

export function extensionImageType(fileName: string): SniffedImageType | null {
  const match = /\.([a-z0-9]+)$/i.exec(fileName);
  if (!match) return null;
  return EXTENSION_TO_TYPE[match[1].toLowerCase()] ?? null;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end; i += 1) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

// Magic-byte sniffing for raster formats. SVG (text) is handled by
// sanitizeSvg instead; this returns the raster type or null.
export function sniffImageType(
  bytes: Uint8Array,
): Exclude<SniffedImageType, "svg"> | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 4, 8) === "ftyp" &&
    ["avif", "avis"].includes(ascii(bytes, 8, 12))
  ) {
    return "avif";
  }
  return null;
}

export class UnsafeSvgError extends Error {}

// SVG is XML text, so magic bytes don't apply. Validate the document shape,
// decode numeric character references so obfuscated payloads (&#106;avascript:)
// can't slip past the checks, then reject any dangerous construct outright.
export function sanitizeSvg(source: string): string {
  const text = source.replace(/^\uFEFF/, "");
  const head = text.trimStart().slice(0, 2048);
  if (!/^<\??[a-z!]/i.test(head) && !head.startsWith("<svg")) {
    throw new UnsafeSvgError("Not an SVG document");
  }
  if (!/<svg[\s>]/i.test(head)) {
    throw new UnsafeSvgError("Not an SVG document");
  }

  const decoded = text.replace(/&#(x?[0-9a-f]+);/gi, (_, code: string) => {
    const value = code.toLowerCase().startsWith("x")
      ? parseInt(code.slice(1), 16)
      : parseInt(code, 10);
    if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return "";
    try {
      return String.fromCodePoint(value);
    } catch {
      return "";
    }
  });
  // Squashed version: whitespace/control collapsed to single spaces (lets the
  // structural checks below see attribute boundaries). Compact version: all
  // whitespace removed (browsers ignore it inside protocol names like
  // "java\tscript:").
  const squashed = decoded.toLowerCase().replace(/[\s\x00-\x1f]+/g, " ");
  const compact = squashed.replace(/\s+/g, "");

  if (/<script[\s/>]/.test(squashed) || /<\/script\s*>/.test(squashed)) {
    throw new UnsafeSvgError("SVG must not contain script");
  }
  if (/<foreignobject[\s/>]/.test(squashed)) {
    throw new UnsafeSvgError("SVG must not contain foreignObject");
  }
  if (/<(iframe|object|embed|audio|video|link|meta|base)\b/.test(squashed)) {
    throw new UnsafeSvgError("SVG must not embed external/active content");
  }
  if (/\son[a-z0-9_-]*\s*=/.test(squashed)) {
    throw new UnsafeSvgError("SVG must not contain event handler attributes");
  }
  if (/javascript:|vbscript:/.test(compact)) {
    throw new UnsafeSvgError("SVG must not contain script URLs");
  }
  if (/<!entity/.test(compact) || /<!doctype[^>]*\[/.test(compact)) {
    throw new UnsafeSvgError("SVG must not declare DTD entities");
  }

  // Every URL reference must be an internal fragment (#id) or a safe inline
  // raster data: URI. Absolute/protocol-relative/external URLs are rejected.
  const refPattern =
    /(?:href|xlink:href|src)\s*=\s*["']([^"']*)["']|url\(\s*["']?\s*([^"')]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = refPattern.exec(compact)) !== null) {
    const value = (match[1] ?? match[2] ?? "").trim();
    if (value === "" || value.startsWith("#")) continue;
    if (/^data:image\/(png|jpe?g|gif|webp);base64,/.test(value)) continue;
    throw new UnsafeSvgError(
      "SVG references must be internal fragments or inline raster data: URIs",
    );
  }

  return text;
}

// Only objects we own live under products/<uuid>/<file> in the
// product-media bucket. Anything else is treated as external and is never
// removed from storage.
const SAFE_OBJECT_NAME =
  /^products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9][a-z0-9.-]*\.(?:jpe?g|png|webp|avif|svg)$/i;

// Category icon objects live under categories/<uuid>/<uuid>.<ext>
const CATEGORY_ICON_SAFE_OBJECT_NAME =
  /^categories\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9][a-z0-9.-]*\.(?:jpe?g|png|webp|avif|svg)$/i;

export function buildStorageObjectName(
  productId: string,
  extension: string,
): string {
  return `products/${productId}/${crypto.randomUUID()}.${extension}`;
}

export function buildCategoryIconObjectName(
  categoryId: string,
  extension: string,
): string {
  return `categories/${categoryId}/${crypto.randomUUID()}.${extension}`;
}

export function parseOwnedStorageObjectName(
  imageUrl: string,
  supabaseUrl: string | undefined,
): string | null {
  if (SAFE_OBJECT_NAME.test(imageUrl)) {
    return imageUrl;
  }
  if (supabaseUrl) {
    const prefix = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${PRODUCT_MEDIA_BUCKET}/`;
    if (imageUrl.startsWith(prefix)) {
      const rawName = imageUrl.slice(prefix.length).split(/[?#]/)[0];
      let name = rawName;
      try {
        name = decodeURIComponent(rawName);
      } catch {
        return null;
      }
      if (SAFE_OBJECT_NAME.test(name)) {
        return name;
      }
    }
  }
  return null;
}

export function parseOwnedCategoryIconObjectName(
  imageUrl: string,
  supabaseUrl: string | undefined,
): string | null {
  if (CATEGORY_ICON_SAFE_OBJECT_NAME.test(imageUrl)) {
    return imageUrl;
  }
  if (supabaseUrl) {
    const prefix = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${CATEGORY_ICON_BUCKET}/`;
    if (imageUrl.startsWith(prefix)) {
      const rawName = imageUrl.slice(prefix.length).split(/[?#]/)[0];
      let name = rawName;
      try {
        name = decodeURIComponent(rawName);
      } catch {
        return null;
      }
      if (CATEGORY_ICON_SAFE_OBJECT_NAME.test(name)) {
        return name;
      }
    }
  }
  return null;
}

export function isAcceptedImageReference(value: string): boolean {
  if (SAFE_OBJECT_NAME.test(value)) return true;
  if (CATEGORY_ICON_SAFE_OBJECT_NAME.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
