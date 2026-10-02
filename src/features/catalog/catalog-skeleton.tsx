import { Skeleton } from "@/components/management/ui/skeleton";

export function ProductCardSkeleton() {
  return (
    <article className="sf-product-card" aria-hidden="true">
      <div className="sf-product-media-shell">
        <div className="sf-product-media">
          <Skeleton
            width="full"
            height="100%"
            style={{ position: "absolute", inset: 0 }}
          />
        </div>
      </div>
      <div
        className="sf-product-body"
        style={{ display: "grid", gap: "0.8rem" }}
      >
        <Skeleton width="sm" />
        <Skeleton width="full" height="1.4rem" />
        <Skeleton width="lg" />
        <Skeleton width="md" height="1.5rem" />
        <Skeleton width="full" height="2.75rem" />
      </div>
    </article>
  );
}

export function ProductGridSkeleton({
  cards = 6,
  label = "Loading products… / טוען מוצרים…",
}: {
  cards?: number;
  label?: string;
}) {
  return (
    <div aria-busy="true" data-route-loading="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      <div className="sf-catalog-grid">
        {Array.from({ length: cards }, (_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

export function CategoryPageSkeleton() {
  return (
    <div className="sf-storefront" aria-busy="true" data-route-loading="true">
      <span className="sr-only" role="status">
        Loading category… / טוען קטגוריה…
      </span>
      <section className="sf-category-hero" aria-hidden="true">
        <div className="miro-container sf-category-hero-inner">
          <div style={{ display: "grid", gap: "1rem" }}>
            <Skeleton width="8rem" />
            <Skeleton width="sm" />
            <Skeleton width="lg" height="3rem" />
            <Skeleton width="full" />
          </div>
          <Skeleton width="100%" height="12rem" />
        </div>
      </section>
      <section className="sf-collection-section">
        <div className="miro-container">
          <ProductGridSkeleton />
        </div>
      </section>
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div
      className="sf-storefront sf-product-detail"
      aria-busy="true"
      data-route-loading="true"
    >
      <span className="sr-only" role="status">
        Loading product… / טוען מוצר…
      </span>
      <div className="sf-product-breadcrumb miro-container" aria-hidden="true">
        <Skeleton width="50%" />
      </div>
      <section className="sf-product-main" aria-hidden="true">
        <div className="miro-container sf-product-detail-layout">
          <div className="sf-product-gallery">
            <div className="sf-main-image">
              <Skeleton
                width="full"
                height="100%"
                style={{ position: "absolute", inset: 0 }}
              />
            </div>
          </div>
          <div
            className="sf-product-info"
            style={{ display: "grid", gap: "1.2rem", alignContent: "start" }}
          >
            <Skeleton width="sm" />
            <Skeleton width="full" height="3rem" />
            <Skeleton width="md" />
            <Skeleton width="lg" height="3rem" />
            <Skeleton width="full" height="4rem" />
            <Skeleton width="full" height="2.75rem" />
          </div>
        </div>
      </section>
    </div>
  );
}

export function ServiceGridSkeleton({
  label = "Loading services… / טוען שירותים…",
}: {
  label?: string;
}) {
  return (
    <div aria-busy="true" data-route-loading="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      <div className="experience-category-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="experience-category-card"
            style={{ display: "grid", gap: "1rem", minHeight: "18rem" }}
          >
            <Skeleton width="3rem" height="3rem" />
            <Skeleton width="75%" height="1.6rem" />
            <Skeleton width="full" />
            <Skeleton width="lg" />
            <Skeleton width="md" />
          </div>
        ))}
      </div>
    </div>
  );
}
