import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Support the same loopback hosts as the Supabase recovery allowlist.
  allowedDevOrigins: ["127.0.0.1"],
  // Product images come from the admin-managed catalog, which stores
  // arbitrary external HTTPS URLs.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async redirects() {
    return [
      {
        source: "/:locale/products",
        destination: "/:locale/store",
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
