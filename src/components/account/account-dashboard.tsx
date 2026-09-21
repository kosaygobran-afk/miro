import Link from "next/link";
import { Children } from "react";
import { AccountForms } from "./account-forms";
import { LogoutButton } from "@/components/auth/logout-button";
import { type AuthContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withLocale, type Locale } from "@/lib/i18n";

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
    { data: saved, error: savedError },
    { data: requests, error: requestError },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, status, total, currency, created_at")
      .eq("user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("saved_products")
      .select("product_id, created_at")
      .eq("user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("service_requests")
      .select("id, service_id, status, created_at")
      .eq("customer_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

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

        {(orderError || savedError || requestError) && (
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
            href={withLocale(
              locale,
              context.role === "worker" ? "worker" : "admin",
            )}
          >
            {locale === "he" ? "סביבת עבודה" : "Workspace"}
          </Link>
        )}
        <div className="grid gap-5 md:grid-cols-3">
          <SummaryCard
            title={locale === "he" ? "רכישות" : "Purchases"}
            value={orders?.length ?? 0}
          />
          <SummaryCard
            title={locale === "he" ? "שמורים לקנייה" : "Saved products"}
            value={saved?.length ?? 0}
          />
          <SummaryCard
            title={locale === "he" ? "פניות שירות" : "Service requests"}
            value={requests?.length ?? 0}
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
            href={withLocale(locale, "store")}
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
