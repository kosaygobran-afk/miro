import { cartCopy } from "@/features/cart/cart-copy";
import { formatCartPrice } from "@/features/cart/cart-items";
import { z } from "zod";
import styles from "./requests-queue.module.css";
import detailStyles from "./request-details.module.css";

const checkoutMetadata = z.object({
  checkout: z.object({
    fulfillment: z.enum(["delivery", "pickup"]).optional(),
    shipping: z
      .object({
        address: z.string(),
        city: z.string(),
        postalCode: z.string().optional(),
      })
      .optional(),
    cart: z
      .array(
        z.object({
          name: z.string(),
          quantity: z.number(),
          label: z.string().optional(),
        }),
      )
      .optional(),
    estimated_subtotal: z.number().optional(),
  }),
});

export function CheckoutRequestDetails({
  metadata,
  locale,
}: {
  metadata: unknown;
  locale: "he" | "en";
}) {
  const result = checkoutMetadata.safeParse(metadata);
  if (!result.success) return null;

  const copy = cartCopy[locale];
  const { fulfillment, shipping, cart, estimated_subtotal } =
    result.data.checkout;
  const method = fulfillment ?? (shipping ? "delivery" : null);

  return (
    <section className={`${styles.drawerSection} ${detailStyles.panel}`}>
      <h3 className={styles.drawerSectionTitle}>{copy.checkoutTitle}</h3>
      <dl className={detailStyles.metadata}>
        {method ? (
          <div>
            <dt>{copy.fulfillment}</dt>
            <dd>{copy[method]}</dd>
          </div>
        ) : null}
        {shipping ? (
          <div>
            <dt>{copy.shipping}</dt>
            <dd dir="auto">
              {[shipping.address, shipping.city, shipping.postalCode]
                .filter(Boolean)
                .join(", ")}
            </dd>
          </div>
        ) : null}
        {estimated_subtotal !== undefined ? (
          <div>
            <dt>{copy.subtotal}</dt>
            <dd>
              <bdi>{formatCartPrice(estimated_subtotal, locale, "—")}</bdi>
            </dd>
          </div>
        ) : null}
        {cart?.length ? (
          <div>
            <dt>{copy.summary}</dt>
            <dd>
              <ul>
                {cart.map((item, index) => (
                  <li key={index}>
                    <bdi>{item.label || item.name}</bdi> ×{" "}
                    <bdi>{item.quantity}</bdi>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
