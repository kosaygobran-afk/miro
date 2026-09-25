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
    description:
      "Illustrative camera card with stable media ratio and MIRO styling.",
    shortDescription: "Illustrative camera card for development preview.",
    priceIls: 790,
    category: "Security cameras",
    categorySlug: "cameras",
    badge: "New",
    variants: [
      {
        id: "v1",
        sku: "CAM-PRO-BLK",
        colorHe: "שחור",
        colorEn: "Black",
        colorHex: "#1a1a1a",
        price: 790,
        stockQty: 10,
        lowStockThreshold: 3,
      },
    ],
    stockQty: 10,
    stockState: "in_stock",
    outOfStockPolicy: "keep_visible_contact",
    expectedRestockDate: null,
    slug: "camera-pro",
    brand: "MIRO",
    modelNumber: "CAM-PRO",
    specifications: {},
    warranty: "2 years",
    images: [],
    seoTitle: "MIRO Pro Dome Camera - Development Preview",
    seoDescription: "Illustrative camera card for development preview.",
  },
  {
    id: "alarm-kit",
    name: "Wireless Alarm Kit",
    description: "Illustrative alarm kit card. Not real inventory or pricing.",
    shortDescription: "Illustrative alarm kit for development preview.",
    priceIls: 1490,
    category: "Alarm systems",
    categorySlug: "alarms",
    badge: "Preview",
    variants: [
      {
        id: "v1",
        sku: "ALARM-KIT-WHT",
        colorHe: "לבן",
        colorEn: "White",
        colorHex: "#f5f5f5",
        price: 1490,
        stockQty: 5,
        lowStockThreshold: 3,
      },
    ],
    stockQty: 5,
    stockState: "low",
    outOfStockPolicy: "keep_visible_contact",
    expectedRestockDate: null,
    slug: "alarm-kit",
    brand: "MIRO",
    modelNumber: "ALARM-KIT",
    specifications: {},
    warranty: "2 years",
    images: [],
    seoTitle: "Wireless Alarm Kit - Development Preview",
    seoDescription: "Illustrative alarm kit for development preview.",
  },
  {
    id: "video-intercom",
    name: "Smart Video Intercom",
    description:
      "Development-only product preview for later catalog integration.",
    shortDescription: "Illustrative video intercom for development preview.",
    priceIls: 990,
    category: "Intercom",
    categorySlug: "intercom",
    variants: [
      {
        id: "v1",
        sku: "INTERCOM-SLV",
        colorHe: "כסוף",
        colorEn: "Silver",
        colorHex: "#c0c0c0",
        price: 990,
        stockQty: 8,
        lowStockThreshold: 3,
      },
    ],
    stockQty: 8,
    stockState: "in_stock",
    outOfStockPolicy: "keep_visible_contact",
    expectedRestockDate: null,
    slug: "video-intercom",
    brand: "MIRO",
    modelNumber: "INTERCOM",
    specifications: {},
    warranty: "2 years",
    images: [],
    seoTitle: "Smart Video Intercom - Development Preview",
    seoDescription: "Illustrative video intercom for development preview.",
  },
  {
    id: "wifi-access",
    name: "Wi-Fi 6 Access Point",
    description: "Illustrative network product card with no real stock claim.",
    shortDescription:
      "Illustrative Wi-Fi 6 access point for development preview.",
    priceIls: 690,
    category: "Network and Wi-Fi",
    categorySlug: "networkGear",
    variants: [
      {
        id: "v1",
        sku: "WIFI6-AP-WHT",
        colorHe: "לבן",
        colorEn: "White",
        colorHex: "#f5f5f5",
        price: 690,
        stockQty: 12,
        lowStockThreshold: 3,
      },
    ],
    stockQty: 12,
    stockState: "in_stock",
    outOfStockPolicy: "keep_visible_contact",
    expectedRestockDate: null,
    slug: "wifi-access",
    brand: "MIRO",
    modelNumber: "WIFI6-AP",
    specifications: {},
    warranty: "2 years",
    images: [],
    seoTitle: "Wi-Fi 6 Access Point - Development Preview",
    seoDescription:
      "Illustrative Wi-Fi 6 access point for development preview.",
  },
];

export default function CatalogPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <section className="min-h-screen bg-background py-10">
      <div className="miro-container">
        <div className="mb-8">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-accent-text">
            Development only
          </p>
          <h1 className="mt-3 text-4xl font-black">Catalog preview</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Illustrative data only. No real products, prices, checkout,
            inventory or brand partnerships are represented.
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
