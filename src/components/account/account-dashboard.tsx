import Link from "next/link";
import Image from "next/image";
import { Children } from "react";
import { AccountForms } from "./account-forms";
import { RemoveSavedButton } from "./remove-saved-button";
import { LogoutButton } from "@/components/auth/logout-button";
import { type AuthContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withLocale, type Locale } from "@/lib/i18n";
import { roleHome } from "@/lib/roles";
import {
  getSavedProductsWithCanonicalData,
  type StoreViewer,
} from "@/lib/store-data";
import { formatPrice } from "@/lib/catalog/pricing";
import { storeCopy } from "@/features/catalog/store-copy";

export async function AccountDashboard({
  locale,
  context,
}: {
  locale: Locale;
  context: AuthContext;
}) {
  const supabase = await createServerSupabaseClient();
  const [
    { data: orders, error: orderError },
    { data: requests, error: requestError },
    { data: invoices, error: invoiceError },
    { data: savedProductsRaw, error: savedError },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, status, total, currency, created_at")
      .eq("user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("service_requests")
      .select("id, service_id, status, created_at")
      .eq("customer_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, status, total, currency, issued_at, created_at",
      )
      .eq("user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("saved_products")
      .select("product_id, created_at")
      .eq("user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Fetch saved products with canonical data (images, pricing, stock)
  const viewer: StoreViewer = {
    role: context.role,
    savedProductIds: (savedProductsRaw ?? []).map((sp) => sp.product_id),
  };
  const savedProducts = await getSavedProductsWithCanonicalData(
    locale,
    context.user.id,
    viewer.role,
  );

  const roleLabel =
    locale === "he"
      ? { customer: "לקוח", worker: "עובד", admin: "מנהל", ceo: "מנהל ראשי" }[
          context.role
        ]
      : context.role;

  return (
    <section className="miro-section">
      <div className="miro-container space-y-6">
        <div className="miro-card flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-accent-text">
              {roleLabel}
            </p>
            <h1 className="mt-2 text-3xl font-black">
              {context.profile?.full_name || context.user.email}
            </h1>
            <p className="mt-2 text-muted-foreground">{context.user.email}</p>
          </div>
          <LogoutButton
            locale={locale}
            label={locale === "he" ? "התנתקות" : "Log out"}
          />
        </div>

        {(orderError || savedError || requestError || invoiceError) && (
          <p role="status">
            {locale === "he"
              ? "חלק מנתוני החשבון אינם זמינים כרגע."
              : "Some account information is currently unavailable."}
          </p>
        )}
        <AccountForms
          locale={locale}
          name={context.profile?.full_name ?? ""}
          phone={context.profile?.phone ?? ""}
        />
        {(context.role === "admin" ||
          context.role === "ceo" ||
          context.role === "worker") && (
          <Link
            className="miro-button miro-button-secondary"
            href={withLocale(locale, roleHome(context.role))}
          >
            {context.role === "ceo"
              ? locale === "he"
                ? "פתיחת לוח המנכ״ל"
                : "Open CEO dashboard"
              : locale === "he"
                ? "פתיחת סביבת העבודה"
                : "Open workspace"}
          </Link>
        )}
        <div className="grid gap-5 md:grid-cols-4">
          <SummaryCard
            title={locale === "he" ? "רכישות" : "Purchases"}
            value={orders?.length ?? 0}
          />
          <SummaryCard
            title={locale === "he" ? "שמורים לקנייה" : "Saved products"}
            value={savedProducts?.length ?? 0}
          />
          <SummaryCard
            title={locale === "he" ? "פניות שירות" : "Service requests"}
            value={requests?.length ?? 0}
          />
          <SummaryCard
            title={locale === "he" ? "חשבוניות" : "Invoices"}
            value={invoices?.length ?? 0}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <HistoryPanel
            title={locale === "he" ? "היסטוריית רכישות" : "Purchase history"}
            empty={locale === "he" ? "אין רכישות עדיין." : "No purchases yet."}
          >
            {orders?.map((order) => (
              <li
                key={order.id}
                className="flex justify-between gap-4 border-b border-border-subtle py-3 text-sm"
              >
                <span>{order.order_number}</span>
                <span>
                  {order.total} {order.currency} · {order.status}
                </span>
              </li>
            ))}
          </HistoryPanel>
          <HistoryPanel
            title={locale === "he" ? "פניות ושירותים" : "Services and requests"}
            empty={
              locale === "he" ? "אין פניות עדיין." : "No service requests yet."
            }
          >
            {requests?.map((request) => (
              <li
                key={request.id}
                className="flex justify-between gap-4 border-b border-border-subtle py-3 text-sm"
              >
                <span>{request.service_id || "Service request"}</span>
                <span>{request.status}</span>
              </li>
            ))}
          </HistoryPanel>
        </div>

        {/* Saved Products Panel */}
        {savedProducts.length > 0 && (
          <div className="miro-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black">
                {locale === "he" ? "מוצרים שמורים" : "Saved Products"}
              </h2>
              <Link
                className="miro-button miro-button-secondary text-sm"
                href={withLocale(locale)}
              >
                {locale === "he" ? "המשך קנייה" : "Continue shopping"}
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {savedProducts.map((item) => (
                <article
                  key={item.productId}
                  className="miro-card p-4 flex flex-col"
                >
                  <div className="aspect-video bg-surface-muted rounded-lg overflow-hidden relative mb-3">
                    {item.imageUrl && (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {item.categoryLabel ?? item.category}
                  </p>
                  <h3 className="font-bold text-sm mb-2 line-clamp-1">
                    {item.name}
                  </h3>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-lg font-black">
                      {formatPrice(
                        item.price,
                        locale,
                        storeCopy[locale].priceUnpublished,
                      )}
                    </span>
                    <RemoveSavedButton
                      productId={item.productId}
                      label={locale === "he" ? "הסר" : "Remove"}
                    />
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* Invoices Panel */}
        {invoices && invoices.length > 0 && (
          <div className="miro-card p-6">
            <h2 className="text-xl font-black mb-4">
              {locale === "he" ? "חשבוניות" : "Invoices"}
            </h2>
            <ul className="space-y-2">
              {invoices.map((invoice) => (
                <li
                  key={invoice.id}
                  className="flex justify-between items-center border-b border-border-subtle py-3 text-sm"
                >
                  <div>
                    <span className="font-medium">
                      {invoice.invoice_number}
                    </span>
                    <span className="ml-3 px-2 py-0.5 text-xs bg-surface-muted rounded">
                      {invoice.status}
                    </span>
                  </div>
                  <span className="font-black">
                    {invoice.total} {invoice.currency}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="miro-card flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h2 className="text-xl font-black">
              {locale === "he" ? "המשך קנייה" : "Continue shopping"}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {locale === "he"
                ? "המוצרים ששמרת זמינים כשנבנה את חוויית הקנייה המלאה."
                : "Your saved products will be available as the full buying flow is completed."}
            </p>
          </div>
          <Link
            className="miro-button miro-button-primary"
            href={withLocale(locale)}
          >
            {locale === "he" ? "לחנות" : "Browse store"}
          </Link>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="miro-card p-5">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function HistoryPanel({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="miro-card p-6">
      <h2 className="text-xl font-black">{title}</h2>
      <ul className="mt-3">
        {Children.count(children) > 0 ? (
          children
        ) : (
          <li className="py-3 text-sm text-muted-foreground">{empty}</li>
        )}
      </ul>
    </div>
  );
}
