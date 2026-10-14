/** CSP for Next's request nonce. Inline style attributes support the existing theme/motion contract. */
export function contentSecurityPolicy(
  nonce: string,
  development: boolean,
  supabaseUrl?: string,
) {
  if (!/^[A-Za-z0-9+/=]+$/.test(nonce)) throw new Error("Invalid nonce");
  let supabase = "";
  try {
    if (supabaseUrl) {
      const url = new URL(supabaseUrl);
      if (url.protocol === "https:")
        supabase = `${url.origin} wss://${url.host}`;
    }
  } catch {
    /* Missing/invalid upstream remains blocked. */
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} https://vitals.vercel-insights.com${development ? " ws: http://localhost:* http://127.0.0.1:*" : ""}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
