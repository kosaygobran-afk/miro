import "server-only";
import { createHash } from "node:crypto";
import { CommerceError } from "./http";

export const COMMERCE_PRIVATE_BUCKET = "commerce-private";
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export function inspectExpenseAttachment(
  bytes: Uint8Array,
  name: string,
  declaredMime: string,
) {
  if (!bytes.length || bytes.length > ATTACHMENT_MAX_BYTES)
    throw new CommerceError("attachment_too_large", 413);
  let mime: string;
  let extension: string;
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    mime = "image/png";
    extension = "png";
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    mime = "image/jpeg";
    extension = "jpg";
  } else if (new TextDecoder("ascii").decode(bytes.slice(0, 5)) === "%PDF-") {
    mime = "application/pdf";
    extension = "pdf";
  } else throw new CommerceError("unsupported_attachment", 415);
  const suffix = name.split(".").pop()?.toLowerCase();
  if (
    declaredMime !== mime ||
    ![extension, ...(extension === "jpg" ? ["jpeg"] : [])].includes(
      suffix ?? "",
    )
  )
    throw new CommerceError("attachment_type_mismatch", 415);
  const originalName =
    name
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\u0000-\u001f\u007f]/g, "")
      .slice(0, 180) || `document.${extension}`;
  return {
    detected_mime: mime,
    extension,
    original_name: originalName,
    byte_size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
