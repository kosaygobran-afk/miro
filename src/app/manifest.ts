import type { MetadataRoute } from "next";

/** Install metadata only; no service worker or private application cache is registered. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/admin/pos",
    name: "MIRO POS",
    short_name: "MIRO POS",
    description: "MIRO management point of sale",
    start_url: "/he/admin/pos",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#111111",
    theme_color: "#111111",
    icons: [
      {
        src: "/miro-pos-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/miro-pos-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/miro-pos-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
