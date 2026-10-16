import "server-only";

import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { PRODUCT_MEDIA_MAX_BYTES } from "./image-safety";

const deniedV4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  deniedV4.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const deniedV6 = new BlockList();
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const) {
  deniedV6.addSubnet(address, prefix, "ipv6");
}

export function isPublicImageAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return !deniedV4.check(address, "ipv4");
  // Excludes loopback, ULA, link-local, mapped IPv4 and translation ranges.
  return (
    family === 6 &&
    globalV6.check(address, "ipv6") &&
    !deniedV6.check(address, "ipv6")
  );
}

export async function downloadProductImage(input: string): Promise<Buffer> {
  const signal = AbortSignal.timeout(15000);
  let url = new URL(input);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      throw new Error(
        "Use a public HTTPS image URL without credentials or a custom port",
      );
    }
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await Promise.race([
      lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        if (signal.aborted) reject(new Error("Image download timed out"));
        else
          signal.addEventListener(
            "abort",
            () => reject(new Error("Image download timed out")),
            { once: true },
          );
      }),
    ]);
    if (
      !addresses.length ||
      addresses.some(({ address }) => !isPublicImageAddress(address))
    ) {
      throw new Error(
        "Image URL must resolve only to public internet addresses",
      );
    }
    const pinned = addresses[0];
    const result = await new Promise<Buffer | URL>((resolve, reject) => {
      const req = request(
        url,
        {
          agent: false,
          family: pinned.family,
          signal,
          headers: { Accept: "image/*", "Accept-Encoding": "identity" },
          // Pin the validated DNS answer to this connection, including redirects.
          lookup: (_host, _options, callback) =>
            callback(null, pinned.address, pinned.family),
        },
        (response) => {
          const status = response.statusCode ?? 500;
          if (
            [301, 302, 303, 307, 308].includes(status) &&
            response.headers.location
          ) {
            response.destroy();
            try {
              resolve(new URL(response.headers.location, url));
            } catch {
              reject(new Error("Invalid image redirect"));
            }
            return;
          }
          if (
            status !== 200 ||
            !response.headers["content-type"]
              ?.toLowerCase()
              .startsWith("image/") ||
            Number(response.headers["content-length"] ?? 0) >
              PRODUCT_MEDIA_MAX_BYTES
          ) {
            response.destroy();
            reject(new Error("URL must return an image of at most 5 MB"));
            return;
          }
          let size = 0;
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > PRODUCT_MEDIA_MAX_BYTES)
              response.destroy(new Error("Image exceeds 5 MB"));
            else chunks.push(chunk);
          });
          response.on("end", () => resolve(Buffer.concat(chunks)));
          response.on("error", reject);
          response.on("aborted", () =>
            reject(new Error("Image download interrupted")),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
    if (Buffer.isBuffer(result)) return result;
    url = result;
  }
  throw new Error("Too many image redirects");
}
