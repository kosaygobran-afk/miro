"use client";

import { useCart } from "./cart-context";
import type { Locale } from "@/lib/i18n";

export function ShoppingSyncNotice({ locale }: { locale: Locale }) {
  const { account, syncIssue, saving, retryShopping } = useCart();
  const he = locale === "he";
  if (!syncIssue) return null;
  const browserOnly = !account;
  return (
    <div
      role="status"
      className="miro-container flex flex-wrap items-center gap-3 py-3"
    >
      <p>
        {browserOnly
          ? he
            ? "סנכרון החשבון אינו זמין כרגע. אפשר להמשיך לקנות בדפדפן הזה."
            : "Account sync is temporarily unavailable. You can keep shopping in this browser."
          : saving
            ? he
              ? "השינויים בסל או ברשימת המשאלות ממתינים לסנכרון."
              : "Your cart or wishlist has changes waiting to sync."
            : he
              ? "לא ניתן לרענן כרגע את סל הקניות ואת רשימת המשאלות מהחשבון."
              : "Your cart and wishlist could not refresh from your account."}
      </p>
      <button
        type="button"
        className="miro-button miro-button-secondary"
        onClick={retryShopping}
      >
        {he ? "נסו שוב" : "Try again"}
      </button>
    </div>
  );
}
