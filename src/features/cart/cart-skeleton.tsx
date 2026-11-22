import { ShoppingBag } from "lucide-react";
import { FormSkeleton, Skeleton } from "@/components/management/ui/skeleton";
import { cartCopy } from "./cart-copy";
import { ShoppingPageHeading } from "./shopping-page";

/** Keep the cart/checkout heading stable while the local cart hydrates. */
export function CartSkeleton({
  locale,
  checkout = false,
}: {
  locale: "he" | "en";
  checkout?: boolean;
}) {
  const copy = cartCopy[locale];
  return (
    <div
      className={checkout ? "sf-checkout-page" : "sf-cart-page"}
      aria-busy="true"
      data-route-loading="true"
    >
      <span className="sr-only" role="status">
        {locale === "he" ? "טוען סל…" : "Loading cart…"}
      </span>
      <div
        className={
          checkout ? "miro-container" : "miro-container sf-shopping-container"
        }
      >
        {checkout ? (
          <header className="sf-cart-heading">
            <span className="sf-cart-heading-icon" aria-hidden="true">
              <ShoppingBag size={24} />
            </span>
            <div>
              <h1>{copy.checkoutTitle}</h1>
              <p>{copy.checkoutIntro}</p>
            </div>
          </header>
        ) : (
          <ShoppingPageHeading
            locale={locale}
            page="cart"
            title={copy.cartTitle}
          />
        )}
        <div className={checkout ? "sf-checkout-layout" : "sf-cart-layout"}>
          {checkout ? (
            <FormSkeleton
              fields={8}
              label={
                locale === "he" ? "טוען טופס בקשה…" : "Loading request form…"
              }
            />
          ) : (
            <section className="sf-cart-items" aria-hidden="true">
              {Array.from({ length: 3 }, (_, index) => (
                <article className="sf-cart-item" key={index}>
                  <div className="sf-cart-item-media">
                    <Skeleton width="full" height="100%" />
                  </div>
                  <div
                    className="sf-cart-item-copy"
                    style={{ display: "grid", gap: "0.8rem" }}
                  >
                    <Skeleton width="full" />
                    <Skeleton width="md" />
                    <Skeleton width="8rem" height="2rem" />
                  </div>
                  <div className="sf-cart-item-footer">
                    <Skeleton width="7rem" height="2.75rem" />
                    <Skeleton width="4rem" />
                  </div>
                </article>
              ))}
            </section>
          )}
          <aside
            className={checkout ? "sf-checkout-summary" : "sf-cart-summary"}
            aria-hidden="true"
          >
            <h2>{copy.summary}</h2>
            <Skeleton width="full" height="1.5rem" />
            <Skeleton width="full" />
            <Skeleton width="full" height="2.75rem" />
          </aside>
        </div>
      </div>
    </div>
  );
}
