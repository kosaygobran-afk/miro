/** Compare the browser origin to the host the trusted ingress forwarded. */
export function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    // Prefer the proxy-forwarded host (trusted ingress on Vercel sets it);
    // fall back to Host when no proxy header exists.
    const host =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const protocol =
      request.headers.get("x-forwarded-proto") ??
      new URL(request.url).protocol.replace(":", "");
    return parsed.host === host && parsed.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}
