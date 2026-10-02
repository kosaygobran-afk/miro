import { ShoppingBag } from "lucide-react";
import { FormSkeleton, Skeleton } from "@/components/management/ui/skeleton";
import { cartCopy } from "./cart-copy";

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
      <div className="miro-container">
        <header className="sf-cart-heading">
          <span className="sf-cart-heading-icon" aria-hidden="true">
            <ShoppingBag size={24} />
          </span>
          <div>
            <h1>{checkout ? copy.checkoutTitle : copy.cartTitle}</h1>
            <p>{checkout ? copy.checkoutIntro : copy.cartIntro}</p>
          </div>
        </header>
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
                  <Skeleton width="4rem" />
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
