import "server-only";

import sharp from "sharp";
import { z } from "zod";
import {
  IMAGE_MIME_BY_TYPE,
  PRODUCT_MEDIA_MAX_BYTES,
  sanitizeSvg,
  sniffImageType,
  type SniffedImageType,
} from "./image-safety";

export type BackgroundRemovalInfo = {
  status: "processed" | "transparent" | "original";
  skipped: boolean;
  reason: string | null;
};

const workerResultSchema = z.object({
  skipped: z.boolean(),
  reason: z.string().max(300).nullable(),
  image_base64: z.string().min(1),
  mode: z.string().max(30),
});
const MAX_PIXELS = 16_000_000;

export async function validateProductImage(
  bytes: Buffer,
): Promise<SniffedImageType> {
  if (!bytes.length || bytes.length > PRODUCT_MEDIA_MAX_BYTES) {
    throw new Error("Image must be between 1 byte and 5 MB");
  }
  const type = sniffImageType(bytes);
  if (!type) {
    sanitizeSvg(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return "svg";
  }
  // Magic bytes alone do not prove that a raster can be decoded safely.
  const metadata = await sharp(bytes, {
    limitInputPixels: MAX_PIXELS,
  }).metadata();
  if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) {
    throw new Error("Only still images up to 16 megapixels are supported");
  }
  await sharp(bytes, { limitInputPixels: MAX_PIXELS }).stats();
  return type;
}

export async function processProductImage(
  bytes: Buffer,
  type: SniffedImageType,
  removeBackground = true,
) {
  const original = (reason: string) => ({
    bytes,
    type,
    backgroundRemoval: {
      status: "original",
      skipped: true,
      reason,
    } satisfies BackgroundRemovalInfo,
  });
  if (!removeBackground) return original("user_requested_original");
  if (type === "svg") return original("svg");
  const workerUrl = process.env.BACKGROUND_REMOVAL_WORKER_URL;
  const token = process.env.BACKGROUND_REMOVAL_WORKER_TOKEN;
  if (!workerUrl || !token) return original("worker_not_configured");

  try {
    const url = new URL(workerUrl);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Error("Invalid worker configuration");
    }
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/remove-background`;
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(bytes)], { type: IMAGE_MIME_BY_TYPE[type] }),
      `image.${type}`,
    );
    const configuredTimeout = Number(
      process.env.BACKGROUND_REMOVAL_TIMEOUT_MS ?? 30000,
    );
    const timeout = Number.isFinite(configuredTimeout)
      ? Math.min(60000, Math.max(1000, configuredTimeout))
      : 30000;
    // Only pure worker computation may retry, before any storage/database write.
    // A shared deadline also covers the busy wait and the second attempt.
    const signal = AbortSignal.timeout(timeout);
    const invoke = () =>
      fetch(url, {
        method: "POST",
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal,
        redirect: "error",
        cache: "no-store",
      });
    let response = await invoke();
    const retryAfter = response.headers.get("retry-after");
    if (
      response.status === 503 &&
      retryAfter !== null &&
      /^[0-2]$/.test(retryAfter)
    ) {
      await response.body?.cancel();
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(signal.reason);
        const abort = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(
          () => {
            signal.removeEventListener("abort", abort);
            resolve();
          },
          Number(retryAfter) * 1000,
        );
        signal.addEventListener("abort", abort, { once: true });
      });
      response = await invoke();
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Worker unavailable");
    }
    // Bound streamed JSON too: an absent/incorrect Content-Length is not a cap.
    if (!response.body) throw new Error("Empty worker response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > Math.ceil((PRODUCT_MEDIA_MAX_BYTES * 4) / 3) + 4096) {
          throw new Error("Worker response too large");
        }
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const result = workerResultSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    // A transparency skip preserves the exact original format/bytes.
    if (result.skipped) {
      const stats = await sharp(bytes).stats();
      const alpha = stats.channels.length === 4 ? stats.channels[3] : undefined;
      if (!alpha || alpha.min >= 128)
        throw new Error("Invalid transparency skip");
      return {
        bytes,
        type,
        backgroundRemoval: {
          status: "transparent",
          skipped: true,
          reason: result.reason,
        } satisfies BackgroundRemovalInfo,
      };
    }
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        result.image_base64,
      )
    ) {
      throw new Error("Invalid worker encoding");
    }
    const output = Buffer.from(result.image_base64, "base64");
    if ((await validateProductImage(output)) !== "png")
      throw new Error("Worker must return PNG");
    const stats = await sharp(output).stats();
    const alpha = stats.channels.length === 4 ? stats.channels[3] : undefined;
    if (!alpha || alpha.min === 255 || alpha.max === 0)
      throw new Error("Invalid cutout");
    const source = await sharp(bytes).metadata();
    const processed = await sharp(output).metadata();
    const rotated = [5, 6, 7, 8].includes(source.orientation ?? 1);
    if (
      processed.width !== (rotated ? source.height : source.width) ||
      processed.height !== (rotated ? source.width : source.height)
    )
      throw new Error("Cutout dimensions do not match source");
    return {
      bytes: output,
      type: "png" as const,
      backgroundRemoval: {
        status: "processed",
        skipped: false,
        reason: null,
      } satisfies BackgroundRemovalInfo,
    };
  } catch {
    // Never expose worker URLs, provider errors or credentials to the browser/audit.
    console.warn("Product image processing unavailable; preserving original");
    return original("processing_unavailable");
  }
}
