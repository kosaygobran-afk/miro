import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Support the same loopback hosts as the Supabase recovery allowlist.
  allowedDevOrigins: ["127.0.0.1"],
  // Keep development status badges out of storefront previews. Compile/runtime
  // errors remain visible in Next's error overlay and the server terminal.
  devIndicators: false,
  outputFileTracingIncludes: {
    "/api/management/commerce/**": ["./assets/fonts/commerce/**/*"],
    "/api/commerce/jobs": ["./assets/fonts/commerce/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), fullscreen=(self)",
          },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
      {
        source: "/:locale/pay/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        source: "/api/commerce/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
  // Product images come from the admin-managed catalog, which stores
  // arbitrary external HTTPS URLs.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async redirects() {
    return [
      {
        source: "/:locale/store",
        destination: "/:locale",
        permanent: true,
      },
      {
        source: "/:locale/products",
        destination: "/:locale",
        permanent: true,
      },
      {
        source: "/:locale/products/:path*",
        destination: "/:locale/store/:path*",
        permanent: true,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
