/** Compare the browser origin to the Host preserved by Next's trusted ingress. */
export function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const protocol =
      request.headers.get("x-forwarded-proto") ??
      new URL(request.url).protocol.replace(":", "");
    return (
      parsed.host === request.headers.get("host") &&
      parsed.protocol === `${protocol}:`
    );
  } catch {
    return false;
  }
}
