import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { privateMetadata } from "@/components/auth/private-closed-page";
import { WebsiteGalleryEditor } from "@/components/management/website-gallery-settings";
import { PublishedWebsiteImages } from "@/components/management/published-website-images";
import { StoreDesign } from "@/components/management/storefront/store-design";
import { PageHeader } from "@/components/management/ui/page-header";
import { isLocale, withLocale } from "@/lib/i18n";
import { getPublishedServices } from "@/lib/public-services";
import { HOME_HERO_IMAGE } from "@/lib/website-images";
import { getPublishedWebsiteImages } from "@/lib/website-images-server";

export const generateMetadata = privateMetadata("admin", "settings");

export default async function WebsiteImagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "he";
  const he = locale === "he";
  const actor = await requireRole(locale, ["admin", "ceo"]);
  const isCeo = actor.role === "ceo";
  const [services, publishedDesign] = await Promise.all([
    getPublishedServices().catch(() => null),
    isCeo ? null : getPublishedWebsiteImages().catch(() => null),
  ]);

  const slots = [
    {
      key: "home-hero",
      label: he ? "רקע ראשי בדף הבית" : "Home hero background",
      description: he
        ? "מומלץ צילום רוחבי ביחס 16:9, עם שטח פנוי לכותרת סביב מרכז התמונה."
        : "Use a wide 16:9 photo and leave clear space for the headline near the center.",
      defaultUrl: HOME_HERO_IMAGE,
    },
    ...(services ?? []).map((service) => ({
      key: `service-${service.id}`,
      label: he ? service.name_he : service.name_en,
      description: he
        ? "תמונה בעמוד השירות. מומלץ יחס 4:3 ונושא ברור במרכז."
        : "Service detail image. Use a 4:3 photo with a clear, centered subject.",
      defaultUrl: service.image_url ?? "",
    })),
  ];

  return (
    <div className="min-w-0 space-y-8">
      <PageHeader
        title={he ? "תמונות האתר" : "Website images"}
        subtitle={
          isCeo
            ? he
              ? "עריכת התמונות, הגלריות, הרקעים וסמלי החברות באתר."
              : "Manage the website’s photos, galleries, backgrounds and company logos."
            : he
              ? "צפייה בתמונות, בגלריות ובעיצוב החנות שפורסמו באתר."
              : "Review published website images, galleries and store design."
        }
        breadcrumb={[
          {
            label: he ? "הגדרות" : "Settings",
            href: withLocale(locale, "admin/settings"),
          },
          { label: he ? "תמונות האתר" : "Website images" },
        ]}
      />
      <nav
        className="mgmt-section-switcher"
        aria-label={he ? "אזורי תמונות" : "Image settings sections"}
      >
        <Link href="#page-website-images">
          {he ? "בית ושירותים" : "Home and Services"}
        </Link>
        <Link href="#store-website-images">
          {he ? "עיצוב החנות" : "Store design"}
        </Link>
      </nav>
      <div id="page-website-images" className="scroll-mt-32" tabIndex={-1}>
        {services === null ? (
          <p role="status">
            {he
              ? "לא ניתן לטעון כעת את רשימת עמודי השירות. יש לרענן את העמוד כדי לנסות שוב."
              : "The service page list is unavailable. Reload this page to try again."}
          </p>
        ) : null}
        {isCeo ? (
          <WebsiteGalleryEditor locale={locale} slots={slots} />
        ) : (
          <PublishedWebsiteImages
            locale={locale}
            design={publishedDesign}
            slots={slots}
          />
        )}
      </div>
      <div id="store-website-images" className="scroll-mt-32">
        <StoreDesign locale={locale} isCeo={isCeo} />
      </div>
    </div>
  );
}
