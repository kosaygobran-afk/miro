import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductCard, type Product } from "@/features/catalog/product-card";
import { devPreviewRobots } from "@/lib/seo";

export const metadata: Metadata = {
  title: "MIRO catalog development preview",
  robots: devPreviewRobots(),
};

const mockProducts: Product[] = [
  {
    id: "camera-pro",
    name: "MIRO Pro Dome Camera",
    description: "Illustrative camera card with stable media ratio and MIRO styling.",
    priceIls: 790,
    category: "Security cameras",
    badge: "New",
  },
  {
    id: "alarm-kit",
    name: "Wireless Alarm Kit",
    description: "Illustrative alarm kit card. Not real inventory or pricing.",
    priceIls: 1490,
    category: "Alarm systems",
    badge: "Preview",
  },
  {
    id: "video-intercom",
    name: "Smart Video Intercom",
    description: "Development-only product preview for later catalog integration.",
    priceIls: 990,
    category: "Intercom",
  },
  {
    id: "wifi-access",
    name: "Wi-Fi 6 Access Point",
    description: "Illustrative network product card with no real stock claim.",
    priceIls: 690,
    category: "Network and Wi-Fi",
  },
];

export default function CatalogPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <section className="min-h-screen bg-background py-10">
      <div className="miro-container">
        <div className="mb-8">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-accent-text">Development only</p>
          <h1 className="mt-3 text-4xl font-black">Catalog preview</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Illustrative data only. No real products, prices, checkout, inventory or brand partnerships are represented.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {mockProducts.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
