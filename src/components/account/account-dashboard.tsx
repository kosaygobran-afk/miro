import Link from "@/components/motion/motion-link";
import { Children, type ReactNode } from "react";
import {
  Bookmark,
  ClipboardList,
  Receipt,
  ShoppingBag,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { AccountForms } from "./account-forms";
import { RemoveSavedButton } from "./remove-saved-button";
import { LogoutButton } from "@/components/auth/logout-button";
import { RevealImage } from "@/components/ui/reveal-image";
import { OverflowLabel } from "@/features/catalog/overflow-label";
import { type AuthContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withLocale, type Locale } from "@/lib/i18n";
import { roleHome } from "@/lib/roles";
import { getSavedProductsWithCanonicalData } from "@/lib/store-data";
import { formatPrice } from "@/lib/catalog/pricing";
import { storeCopy } from "@/features/catalog/store-copy";
import {
  accountStatusLabel,
  accountDate,
  accountAmount,
} from "@/lib/account-presentation";

export async function AccountDashboard({
  locale,
  context,
}: {
  locale: Locale;
  context: AuthContext;
}) {
  const he = locale === "he";
  const supabase = await createServerSupabaseClient();
  // Each region has an independent failure state. Saved canonical reads begin with history,
  // rather than repeating saved_products after the three history requests have completed.
  const [
    { data: orders, error: orderError },
    { data: requests, error: requestError },
    { data: invoices, error: invoiceError },
    savedProducts,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, status, total, currency, created_at")
      .eq("user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("service_requests")
      .select("id, status, created_at")
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
    getSavedProductsWithCanonicalData(locale, context.user.id, context.role),
  ]);
  const roleLabel = he
    ? { customer: "לקוח", worker: "עובד", admin: "מנהל", ceo: "מנהל ראשי" }[
        context.role
      ]
    : { customer: "Customer", worker: "Worker", admin: "Admin", ceo: "CEO" }[
        context.role
      ];
  const unavailable = he
    ? "הנתונים אינם זמינים כרגע. רעננו את העמוד כדי לנסות שוב."
    : "This information is unavailable. Refresh the page to try again.";
  const scope = he
    ? "עד 10 הרשומות האחרונות בכל אזור. מוצגים רק מוצרים שמורים הזמינים כעת בחנות."
    : "Up to 10 latest entries per section. Saved products show items currently available in the store.";
  return (
    <section className="miro-section account-dashboard">
      <div className="miro-container space-y-6">
        <div className="miro-card account-profile-header flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="account-profile-identity">
            <span className="account-icon" aria-hidden="true">
              <UserRound size={22} />
            </span>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-accent-text">
                {roleLabel}
              </p>
              <h1 className="mt-2 text-3xl font-black" dir="auto">
                {context.profile?.full_name || context.user.email}
              </h1>
              <p className="mt-2 text-muted-foreground" dir="ltr">
                {context.user.email}
              </p>
            </div>
          </div>
          <LogoutButton locale={locale} label={he ? "התנתקות" : "Log out"} />
        </div>
        <div
          className="account-summary grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
          aria-describedby="account-history-scope"
        >
          <SummaryCard
            title={he ? "הזמנות אחרונות" : "Recent orders"}
            value={orderError ? null : (orders?.length ?? 0)}
            icon={ShoppingBag}
            locale={locale}
          />
          <SummaryCard
            title={he ? "מוצרים שמורים" : "Saved products"}
            value={savedProducts?.length ?? null}
            icon={Bookmark}
            locale={locale}
          />
          <SummaryCard
            title={he ? "פניות אחרונות" : "Recent requests"}
            value={requestError ? null : (requests?.length ?? 0)}
            icon={ClipboardList}
            locale={locale}
          />
          <SummaryCard
            title={he ? "חשבוניות אחרונות" : "Recent invoices"}
            value={invoiceError ? null : (invoices?.length ?? 0)}
            icon={Receipt}
            locale={locale}
          />
        </div>
        <p id="account-history-scope" className="text-sm text-muted-foreground">
          {scope}
        </p>
        <AccountForms
          locale={locale}
          name={context.profile?.full_name ?? ""}
          phone={context.profile?.phone ?? ""}
        />
        {context.role !== "customer" && (
          <Link
            className="miro-button miro-button-secondary"
            href={withLocale(locale, roleHome(context.role))}
          >
            {context.role === "ceo"
              ? he
                ? "פתיחת לוח המנכ״ל"
                : "Open CEO dashboard"
              : he
                ? "פתיחת סביבת העבודה"
                : "Open workspace"}
          </Link>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <HistoryPanel
            title={he ? "היסטוריית הזמנות" : "Order history"}
            icon={ShoppingBag}
            empty={he ? "אין הזמנות עדיין." : "No orders yet."}
            error={!!orderError}
            unavailable={unavailable}
          >
            {orders?.map((order) => (
              <li key={order.id} className="account-history-row">
                <div>
                  <strong dir="auto">{order.order_number}</strong>
                  <p className="text-muted-foreground">
                    {accountDate(order.created_at, locale)}
                  </p>
                </div>
                <div className="account-history-detail">
                  <strong>
                    {accountAmount(order.total, order.currency, locale)}
                  </strong>
                  <span className="account-status">
                    {accountStatusLabel(order.status, locale)}
                  </span>
                </div>
              </li>
            ))}
          </HistoryPanel>
          <HistoryPanel
            title={he ? "פניות ושירותים" : "Services and requests"}
            icon={ClipboardList}
            empty={he ? "אין פניות עדיין." : "No service requests yet."}
            error={!!requestError}
            unavailable={unavailable}
          >
            {requests?.map((request) => (
              <li key={request.id} className="account-history-row">
                <div>
                  <strong>{he ? "פניית שירות" : "Service request"}</strong>
                  <p className="text-muted-foreground">
                    {accountDate(request.created_at, locale)}
                  </p>
                </div>
                <span className="account-status">
                  {accountStatusLabel(request.status, locale)}
                </span>
              </li>
            ))}
          </HistoryPanel>
        </div>
        <section
          className="miro-card account-saved-panel p-6"
          aria-labelledby="account-saved-heading"
        >
          <div className="account-panel-heading mb-4">
            <h2
              id="account-saved-heading"
              tabIndex={-1}
              className="text-xl font-black"
            >
              <Bookmark size={22} aria-hidden="true" />
              {he ? "מוצרים שמורים" : "Saved products"}
            </h2>
            <Link
              className="miro-button miro-button-secondary text-sm"
              href={withLocale(locale)}
            >
              {he ? "המשך קנייה" : "Continue shopping"}
            </Link>
          </div>
          {savedProducts === null ? (
            <p role="status" className="text-sm text-muted-foreground">
              {unavailable}
            </p>
          ) : savedProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {he
                ? "אין מוצרים שמורים הזמינים להצגה כרגע."
                : "No saved products are available to display yet."}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {savedProducts.map((item) => (
                <article
                  key={item.productId}
                  className="miro-card account-saved-card p-4 flex flex-col"
                >
                  <Link
                    href={withLocale(
                      locale,
                      `/store/${item.category}/${item.slug}`,
                    )}
                    className="account-saved-link"
                  >
                    <div className="aspect-video bg-surface-muted rounded-lg overflow-hidden relative mb-3">
                      {item.imageUrl ? (
                        <RevealImage
                          src={item.imageUrl}
                          alt=""
                          fill
                          className="object-contain"
                          sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                        />
                      ) : (
                        <ShoppingBag
                          className="account-image-placeholder"
                          size={36}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {item.categoryLabel ?? item.category}
                    </p>
                    <h3 className="font-bold text-sm mb-3">
                      <OverflowLabel>{item.name}</OverflowLabel>
                    </h3>
                  </Link>
                  <div className="account-saved-actions mt-auto">
                    <span
                      className={
                        item.price === null
                          ? "text-sm font-bold"
                          : "text-lg font-black"
                      }
                    >
                      {formatPrice(
                        item.price,
                        locale,
                        storeCopy[locale].priceUnpublished,
                      )}
                    </span>
                    <RemoveSavedButton
                      productId={item.productId}
                      locale={locale}
                      productName={item.name}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <HistoryPanel
          title={he ? "חשבוניות" : "Invoices"}
          icon={Receipt}
          empty={he ? "אין חשבוניות עדיין." : "No invoices yet."}
          error={!!invoiceError}
          unavailable={unavailable}
        >
          {invoices?.map((invoice) => (
            <li key={invoice.id} className="account-history-row">
              <div>
                <strong dir="auto">{invoice.invoice_number}</strong>
                <p className="text-muted-foreground">
                  {accountDate(invoice.issued_at ?? invoice.created_at, locale)}
                </p>
              </div>
              <div className="account-history-detail">
                <strong>
                  {accountAmount(invoice.total, invoice.currency, locale)}
                </strong>
                <span className="account-status">
                  {accountStatusLabel(invoice.status, locale)}
                </span>
              </div>
            </li>
          ))}
        </HistoryPanel>
        <div className="miro-card flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h2 className="text-xl font-black">
              {he ? "המשך קנייה" : "Continue shopping"}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {he
                ? "עיינו במוצרים, שמרו מועדפים ושלחו בקשה לצוות. שליחת בקשה אינה תשלום או שמירת מלאי."
                : "Explore products, save favourites and send a request to the team. Requests do not take payment or reserve stock."}
            </p>
          </div>
          <Link
            className="miro-button miro-button-primary"
            href={withLocale(locale)}
          >
            {he ? "לחנות" : "Browse store"}
          </Link>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  locale,
}: {
  title: string;
  value: number | null;
  icon: LucideIcon;
  locale: Locale;
}) {
  return (
    <div className="miro-card account-summary-card p-5">
      <span className="account-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 text-3xl font-black">
        {value === null ? (
          <span className="text-sm">
            {locale === "he" ? "לא זמין" : "Unavailable"}
          </span>
        ) : (
          value.toLocaleString(locale)
        )}
      </p>
    </div>
  );
}

function HistoryPanel({
  title,
  icon: Icon,
  empty,
  error,
  unavailable,
  children,
}: {
  title: string;
  icon: LucideIcon;
  empty: string;
  error: boolean;
  unavailable: string;
  children: ReactNode;
}) {
  return (
    <section className="miro-card account-history-panel p-6">
      <h2 className="text-xl font-black account-panel-title">
        <Icon size={22} aria-hidden="true" />
        {title}
      </h2>
      {error ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {unavailable}
        </p>
      ) : (
        <ul className="mt-3">
          {Children.count(children) > 0 ? (
            children
          ) : (
            <li className="py-3 text-sm text-muted-foreground">{empty}</li>
          )}
        </ul>
      )}
    </section>
  );
}
