"use client";

import { useState } from "react";
import {
  Banknote,
  Package,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  SlidersHorizontal,
  ArrowUpRight,
} from "lucide-react";
import Link from "@/components/motion/motion-link";
import { periodChange, reportingRangeParams } from "@/lib/management-reporting";
import { financeRatios } from "@/lib/report-insights";
import { InsightCard, InsightSectionHeader } from "./ui/insight-card";
import { ActivityChart } from "./ui/activity-chart";
import { DashboardSkeleton } from "./ui/skeleton";
import { MetricCard } from "./ui/metric-card";
import {
  DateRangePicker,
  dateRangeLabels,
  resolveDateRange,
  type DateRangeValue,
} from "./ui/date-range-picker";
import { DataTable } from "./ui/data-table";
import { EmptyState } from "./ui/empty-state";
import { ErrorState } from "./ui/error-state";
import { Notice } from "./ui/notice";
import { Drawer } from "./ui/drawer";
import { OverflowText } from "./ui/overflow-text";
import { useManagementReport } from "./ui/use-management-report";
import {
  ReportingHeader,
  ReportChoices,
  reportingStyles as s,
} from "./ui/reporting-workspace";

type FinanceTotals = {
  revenueGross: number;
  revenueNet: number;
  vatTotal: number;
  cogs: number;
  grossProfit: number;
  margin: number;
  discounts: number;
  unitsSold: number;
  orderCount: number;
  inventoryValue: number;
  inventoryUnits: number;
};
type FinanceData = {
  range: { from: string; to: string; generatedAt: string };
  totals: FinanceTotals;
  dailySeries: { day: string; gross: number; net: number; orders: number }[];
  previous: { range: { from: string; to: string }; totals: FinanceTotals };
};

export function FinanceDashboard({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";
  const [range, setRange] = useState<DateRangeValue>(() => ({
    preset: "last7",
    ...resolveDateRange("last7"),
  }));
  const [view, setView] = useState<"overview" | "daily">("overview");
  const [chartMetric, setChartMetric] = useState<"revenue" | "orders">(
    "revenue",
  );
  const [chartType, setChartType] = useState<"bar" | "line">("line");
  const [drawer, setDrawer] = useState<
    "settings" | "comparison" | "inventory" | null
  >(null);
  const [compare, setCompare] = useState(true);
  const { data, error, loading, reload } = useManagementReport<FinanceData>(
    `/api/management/finance?${reportingRangeParams(range)}`,
    he ? "לא ניתן לטעון נתונים פיננסיים" : "Unable to load finance data",
  );
  const currency = (value: number) =>
    new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 2,
    }).format(value);
  const number = (value: number) =>
    new Intl.NumberFormat(he ? "he-IL" : "en-IL").format(value);
  const percent = (value: number) =>
    new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(value);
  const date = (value: string) =>
    new Date(
      value.length === 10 ? `${value}T12:00:00Z` : value,
    ).toLocaleDateString(he ? "he-IL" : "en-IL", {
      timeZone: "Asia/Jerusalem",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const totals = data?.totals;
  const cards = [
    {
      key: "revenueGross",
      label: he ? "הכנסות כולל מע״מ" : "Revenue incl. VAT",
      icon: <Banknote size={20} />,
      format: currency,
    },
    {
      key: "grossProfit",
      label: he ? "רווח גולמי" : "Gross profit",
      icon: <TrendingUp size={20} />,
      format: currency,
    },
    {
      key: "orderCount",
      label: he ? "הזמנות" : "Orders",
      icon: <ShoppingBag size={20} />,
      format: number,
    },
    {
      key: "inventoryValue",
      label: he ? "שווי מלאי נוכחי" : "Current inventory value",
      icon: <Package size={20} />,
      format: currency,
    },
  ] as const;
  const details = [
    {
      key: "revenueNet",
      label: he ? "הכנסות ללא מע״מ" : "Revenue excl. VAT",
      format: currency,
    },
    { key: "vatTotal", label: he ? "מע״מ" : "VAT", format: currency },
    {
      key: "cogs",
      label: he ? "עלות המכר" : "Cost of goods sold",
      format: currency,
    },
    {
      key: "discounts",
      label: he ? "הנחות שניתנו" : "Discounts applied",
      format: currency,
    },
    {
      key: "unitsSold",
      label: he ? "יחידות שנמכרו" : "Units sold",
      format: number,
    },
    {
      key: "margin",
      label: he ? "שיעור רווח גולמי" : "Gross margin",
      format: percent,
    },
  ] as const;
  const daily = data?.dailySeries ?? [];
  const ratios = data ? financeRatios(data.totals) : null;
  const previousRatios = data ? financeRatios(data.previous.totals) : null;
  const averageOrderChange =
    ratios?.averageOrder != null && previousRatios?.averageOrder != null
      ? periodChange(ratios.averageOrder, previousRatios.averageOrder)
      : null;
  return (
    <section
      className={`${s.workspace} insight-report-workspace`}
      aria-busy={loading}
    >
      <ReportingHeader
        locale={locale}
        section="finance"
        title={he ? "התמונה הפיננסית" : "Your financial picture"}
        subtitle={
          he
            ? "מהמכירה בחנות עד הרווח הגולמי. תמונה ברורה של העסק שלך."
            : "From store sales to gross profit. A clearer view of your business."
        }
        actions={
          <>
            <button
              type="button"
              className="mgmt-button mgmt-button--secondary"
              onClick={() => setDrawer("settings")}
            >
              <SlidersHorizontal size={17} aria-hidden="true" />
              {he ? "אפשרויות דוח" : "Report options"}
            </button>
            <button
              type="button"
              className="mgmt-button mgmt-button--ghost"
              disabled={loading}
              onClick={reload}
            >
              <RefreshCw size={17} aria-hidden="true" />
              {he ? "רענון" : "Refresh"}
            </button>
          </>
        }
      />
      <div className={s.toolbar}>
        <ReportChoices
          label={he ? "תצוגת כספים" : "Finance view"}
          value={view}
          onChange={setView}
          options={[
            { value: "overview", label: he ? "סקירה" : "Overview" },
            { value: "daily", label: he ? "פירוט יומי" : "Daily ledger" },
          ]}
        />
        <DateRangePicker
          value={range}
          onChange={setRange}
          labels={dateRangeLabels(locale)}
        />
      </div>
      <p className={s.muted} role="status">
        {loading
          ? he
            ? "מעדכן נתונים…"
            : "Updating figures…"
          : data
            ? `${date(data.range.from)} – ${date(data.range.to)} · ${he ? "עודכן" : "Updated"} ${new Date(data.range.generatedAt).toLocaleTimeString(he ? "he-IL" : "en-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" })}`
            : ""}
      </p>
      {error ? (
        data ? (
          <Notice tone="warning">
            {error} ·{" "}
            {he
              ? "מוצגים הנתונים האחרונים שנטענו בהצלחה."
              : "Showing the last successfully loaded figures."}
          </Notice>
        ) : (
          <ErrorState
            title={he ? "לא ניתן לטעון את הדוח" : "Unable to load report"}
            description={error}
            onRetry={reload}
            retryLabel={he ? "נסה שוב" : "Retry"}
          />
        )
      ) : null}
      {loading && !data ? (
        <DashboardSkeleton
          label={he ? "טוען נתונים פיננסיים…" : "Loading finance data…"}
        />
      ) : data ? (
        <div className="motion-content-reveal">
          <div className={s.metrics}>
            {cards.map((card) => {
              const change =
                totals && data && card.key !== "inventoryValue"
                  ? periodChange(
                      totals[card.key],
                      data.previous.totals[card.key],
                    )
                  : null;
              return (
                <MetricCard
                  key={card.key}
                  label={<OverflowText text={card.label} />}
                  value={
                    totals ? (
                      <span dir="ltr">{card.format(totals[card.key])}</span>
                    ) : (
                      "—"
                    )
                  }
                  loading={loading && !data}
                  icon={card.icon}
                  delta={
                    compare && card.key !== "inventoryValue" && totals
                      ? change === null
                        ? he
                          ? "אין בסיס להשוואה"
                          : "No comparison baseline"
                        : `${change > 0 ? "+" : ""}${percent(change)} ${he ? "מול התקופה הקודמת" : "vs previous period"}`
                      : undefined
                  }
                  deltaDirection={
                    change === null || change === 0
                      ? "flat"
                      : change > 0
                        ? "up"
                        : "down"
                  }
                  deltaTone={
                    change === null || change === 0
                      ? "neutral"
                      : change > 0
                        ? "success"
                        : "danger"
                  }
                  footer={
                    card.key === "inventoryValue" ? (
                      <button
                        type="button"
                        className="mgmt-button mgmt-button--ghost"
                        onClick={() => setDrawer("inventory")}
                      >
                        {he ? "פרטי מלאי" : "Inventory details"}
                        <ArrowUpRight size={15} aria-hidden="true" />
                      </button>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
          {view === "overview" ? (
            <>
              <div className="insight-finance-context">
                <InsightSectionHeader
                  title={
                    he ? "מבט נוסף על כל מכירה" : "A closer look at each sale"
                  }
                  description={
                    he
                      ? "יחסים מחושבים מתוך ההזמנות שנרשמו. אותה תקופת דיווח, עם הסבר ברור לכל מספר."
                      : "Ratios calculated from recorded orders. The same reporting period, with a clear explanation for every figure."
                  }
                  icon={<TrendingUp />}
                />
                <div className="insight-summary-grid">
                  <InsightCard
                    title={he ? "ערך הזמנה ממוצע" : "Average order value"}
                    value={
                      ratios?.averageOrder == null
                        ? "—"
                        : currency(ratios.averageOrder)
                    }
                    icon={<ShoppingBag />}
                    description={
                      he
                        ? `${number(data.totals.orderCount)} הזמנות שנרשמו. הכנסה כולל מע״מ חלקי מספר ההזמנות.`
                        : `${number(data.totals.orderCount)} recorded orders. Revenue including VAT divided by order count.`
                    }
                    detail={
                      !compare
                        ? he
                          ? "השוואת התקופות כבויה באפשרויות הדוח."
                          : "Period comparison is turned off in report options."
                        : averageOrderChange != null
                          ? `${averageOrderChange > 0 ? "+" : ""}${percent(averageOrderChange)} · ${he ? "מול ערך ההזמנה הממוצע בתקופה הקודמת" : "versus average order value in the previous period"}`
                          : he
                            ? "כשהתקופה הקודמת ריקה או ערכה אפס, אין בסיס לאחוז שינוי."
                            : "An empty previous period or zero average does not provide a percentage-change baseline."
                    }
                  />
                  <InsightCard
                    title={he ? "יחידות להזמנה" : "Units per order"}
                    value={
                      ratios?.unitsPerOrder == null
                        ? "—"
                        : number(ratios.unitsPerOrder)
                    }
                    icon={<Package />}
                    description={
                      he
                        ? `${number(data.totals.unitsSold)} יחידות שנמכרו חלקי ${number(data.totals.orderCount)} הזמנות. זהו ממוצע, ולא כמות בכל הזמנה.`
                        : `${number(data.totals.unitsSold)} units sold divided by ${number(data.totals.orderCount)} orders. This is an average, rather than the quantity in every order.`
                    }
                    action={{
                      href: `/${locale}/admin/sales`,
                      label: he ? "עיון בהזמנות" : "Review orders",
                    }}
                  />
                  <InsightCard
                    title={
                      he
                        ? "יחס הרווח הגולמי להכנסה נטו"
                        : "Gross profit / net revenue ratio"
                    }
                    value={
                      ratios?.grossMargin == null
                        ? "—"
                        : percent(ratios.grossMargin)
                    }
                    icon={<Banknote />}
                    description={
                      he
                        ? "רווח גולמי חלקי הכנסה ללא מע״מ. עלות המכר כבר נוכתה, והוצאות תפעול טרם נוכו."
                        : "Gross profit divided by revenue excluding VAT. Cost of goods is already deducted; operating expenses are still excluded."
                    }
                    detail={
                      he
                        ? "אין כאן חישוב רווח נקי, תזרים מזומנים או אישור חשבונאי."
                        : "This is not net profit, cash flow or an accounting approval."
                    }
                    action={{
                      href: `/${locale}/admin/settings`,
                      label: he
                        ? "בדיקת הגדרות הכספים"
                        : "Review finance settings",
                    }}
                  />
                </div>
              </div>
              <div className={s.split}>
                <section
                  className={s.panel}
                  aria-labelledby="finance-trend-title"
                >
                  <div className={s.panelHeader}>
                    <div>
                      <h2 id="finance-trend-title">
                        {he
                          ? "ביצועי העסק לאורך זמן"
                          : "Business performance over time"}
                      </h2>
                      <p className={s.muted}>
                        {he
                          ? "נתונים יומיים מהמכירות שנרשמו"
                          : "Daily figures from recorded sales"}
                      </p>
                    </div>
                    <ReportChoices
                      label={he ? "מדד התרשים" : "Chart metric"}
                      value={chartMetric}
                      onChange={setChartMetric}
                      options={[
                        { value: "revenue", label: he ? "הכנסות" : "Revenue" },
                        { value: "orders", label: he ? "הזמנות" : "Orders" },
                      ]}
                    />
                  </div>
                  <ReportChoices
                    label={he ? "סוג התרשים" : "Chart style"}
                    value={chartType}
                    onChange={setChartType}
                    options={[
                      { value: "line", label: he ? "קווים" : "Lines" },
                      { value: "bar", label: he ? "עמודות" : "Bars" },
                    ]}
                  />
                  {daily.length ? (
                    <ActivityChart
                      kind={chartType}
                      days={daily.map((point) => point.day.split("T")[0])}
                      series={
                        chartMetric === "revenue"
                          ? [
                              {
                                label: he ? "כולל מע״מ" : "Incl. VAT",
                                values: daily.map((point) => point.gross),
                                tone: "cyan",
                              },
                              {
                                label: he ? "ללא מע״מ" : "Excl. VAT",
                                values: daily.map((point) => point.net),
                                tone: "violet",
                              },
                            ]
                          : [
                              {
                                label: he ? "הזמנות" : "Orders",
                                values: daily.map((point) => point.orders),
                                tone: "cyan",
                              },
                            ]
                      }
                      locale={locale}
                      unit={
                        chartMetric === "revenue"
                          ? he
                            ? "הכנסות · ₪"
                            : "Revenue · ILS"
                          : he
                            ? "מספר הזמנות"
                            : "Order count"
                      }
                      note={
                        he
                          ? "סיכומים יומיים לפי אזור הזמן של מסד הנתונים. נתונים מדויקים זמינים מתחת לתרשים."
                          : "Daily totals follow the database timezone. Exact figures are available below the chart."
                      }
                    />
                  ) : (
                    <EmptyState
                      title={
                        he ? "אין מכירות בטווח הזה" : "No sales in this range"
                      }
                      description={
                        he
                          ? "בחר טווח רחב יותר כדי לראות פעילות."
                          : "Choose a wider date range to see activity."
                      }
                    />
                  )}
                </section>
                <section
                  className={s.panel}
                  aria-labelledby="finance-profit-title"
                >
                  <h2 id="finance-profit-title">
                    {he ? "מההכנסה לרווח" : "From revenue to profit"}
                  </h2>
                  <dl className={s.ledger}>
                    {(
                      [
                        [
                          he ? "הכנסות כולל מע״מ" : "Revenue incl. VAT",
                          totals?.revenueGross,
                        ],
                        [he ? "מע״מ" : "VAT", totals?.vatTotal],
                        [
                          he ? "הכנסות ללא מע״מ" : "Revenue excl. VAT",
                          totals?.revenueNet,
                        ],
                        [he ? "עלות המכר" : "Cost of goods sold", totals?.cogs],
                        [
                          he ? "רווח גולמי" : "Gross profit",
                          totals?.grossProfit,
                        ],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label}>
                        <dt>
                          <OverflowText text={label} />
                        </dt>
                        <dd dir="ltr">
                          {value === undefined ? "—" : currency(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className={s.muted}>
                    {he
                      ? "ההנחות כבר כלולות בהכנסות. רווח גולמי אינו כולל הוצאות תפעול."
                      : "Revenue already reflects discounts. Gross profit excludes operating expenses."}
                  </p>
                  <button
                    type="button"
                    className="mgmt-button mgmt-button--secondary"
                    onClick={() => setDrawer("comparison")}
                  >
                    {he ? "השוואת תקופות" : "Compare periods"}
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                </section>
              </div>
              <div className={s.metrics}>
                {details.map((item) => (
                  <MetricCard
                    key={item.key}
                    label={<OverflowText text={item.label} />}
                    value={
                      totals ? (
                        <span dir="ltr">{item.format(totals[item.key])}</span>
                      ) : (
                        "—"
                      )
                    }
                  />
                ))}
                <MetricCard
                  label={
                    he ? "הזמנה ממוצעת כולל מע״מ" : "Average order incl. VAT"
                  }
                  value={
                    totals?.orderCount
                      ? currency(totals.revenueGross / totals.orderCount)
                      : "—"
                  }
                />
                <MetricCard
                  label={he ? "יחידות במלאי כעת" : "Units currently in stock"}
                  value={totals ? number(totals.inventoryUnits) : "—"}
                />
              </div>
            </>
          ) : (
            <section className={s.panel}>
              <div className={s.panelHeader}>
                <h2>{he ? "פירוט יומי" : "Daily ledger"}</h2>
                <Link
                  href={`/${locale}/admin/sales`}
                  className="mgmt-button mgmt-button--secondary"
                >
                  {he ? "היסטוריית מכירות" : "Sales history"}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </div>
              <DataTable
                caption={
                  he ? "פירוט הכנסות והזמנות" : "Revenue and orders breakdown"
                }
                minWidth="42rem"
                head={
                  <tr>
                    {[
                      he ? "תאריך" : "Date",
                      he ? "כולל מע״מ" : "Incl. VAT",
                      he ? "ללא מע״מ" : "Excl. VAT",
                      he ? "הזמנות" : "Orders",
                    ].map((label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                }
                isEmpty={!daily.length}
                emptyState={
                  <EmptyState
                    title={
                      he ? "אין נתונים בטווח שנבחר" : "No figures in this range"
                    }
                  />
                }
              >
                {[...daily]
                  .sort((a, b) => b.day.localeCompare(a.day))
                  .map((point) => (
                    <tr key={point.day}>
                      <th scope="row">
                        <time dateTime={point.day}>
                          {date(point.day.split("T")[0])}
                        </time>
                      </th>
                      <td dir="ltr">{currency(point.gross)}</td>
                      <td dir="ltr">{currency(point.net)}</td>
                      <td>{number(point.orders)}</td>
                    </tr>
                  ))}
              </DataTable>
            </section>
          )}
          <p className={s.muted}>
            {he
              ? "תצוגה ניהולית פנימית. אינה חלופה לדוחות חשבונאיים רשמיים."
              : "Internal management figures. Not a substitute for official accounting reports."}
          </p>
        </div>
      ) : null}
      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        side="end"
        className={s.drawer}
        closeLabel={he ? "סגירה" : "Close"}
        title={
          drawer === "settings"
            ? he
              ? "אפשרויות דוח"
              : "Report options"
            : drawer === "inventory"
              ? he
                ? "תמונת המלאי"
                : "Inventory snapshot"
              : he
                ? "השוואת תקופות"
                : "Period comparison"
        }
      >
        <div className={s.details}>
          {drawer === "settings" ? (
            <>
              <p className={s.muted}>
                {he
                  ? "התאם את הדוח ואת התצוגה שלך."
                  : "Choose the range and presentation that work for you."}
              </p>
              <DateRangePicker
                value={range}
                onChange={setRange}
                labels={dateRangeLabels(locale)}
              />
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={compare}
                  onChange={(event) => setCompare(event.target.checked)}
                />
                {he
                  ? "הצג השוואה לתקופה קודמת"
                  : "Show previous-period comparisons"}
              </label>
              <ReportChoices
                label={he ? "סוג התרשים" : "Chart style"}
                value={chartType}
                onChange={setChartType}
                options={[
                  { value: "line", label: he ? "קווים" : "Lines" },
                  { value: "bar", label: he ? "עמודות" : "Bars" },
                ]}
              />
            </>
          ) : drawer === "inventory" ? (
            <>
              <p className={s.muted}>
                {he
                  ? "המלאי הוא צילום מצב נוכחי, ולא יתרה היסטורית לפי טווח התאריכים."
                  : "Inventory reflects current stock, rather than a historical balance for the selected dates."}
              </p>
              <dl className={s.ledger}>
                <div>
                  <dt>{he ? "שווי מלאי" : "Inventory value"}</dt>
                  <dd dir="ltr">
                    {totals ? currency(totals.inventoryValue) : "—"}
                  </dd>
                </div>
                <div>
                  <dt>{he ? "יחידות" : "Units"}</dt>
                  <dd>{totals ? number(totals.inventoryUnits) : "—"}</dd>
                </div>
              </dl>
              <Link
                href={`/${locale}/admin/inventory`}
                className="mgmt-button mgmt-button--secondary"
              >
                {he ? "ניהול מלאי" : "Manage inventory"}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
              <Link
                href={`/${locale}/admin/suppliers`}
                className="mgmt-button mgmt-button--ghost"
              >
                {he ? "ניהול ספקים" : "Manage suppliers"}
              </Link>
            </>
          ) : data ? (
            <>
              <p className={s.muted}>
                {he ? "תקופה נוכחית" : "Current period"}:{" "}
                {date(data.range.from)} – {date(data.range.to)}
                <br />
                {he ? "תקופה קודמת" : "Previous period"}:{" "}
                {date(data.previous.range.from)} –{" "}
                {date(data.previous.range.to)}
              </p>
              <DataTable
                caption={
                  he ? "השוואת מדדי תקופות" : "Period metric comparisons"
                }
                minWidth="32rem"
                head={
                  <tr>
                    <th scope="col">{he ? "מדד" : "Metric"}</th>
                    <th scope="col">{he ? "נוכחי" : "Current"}</th>
                    <th scope="col">{he ? "קודם" : "Previous"}</th>
                  </tr>
                }
              >
                {[
                  ...cards.filter((card) => card.key !== "inventoryValue"),
                  ...details,
                ].map((item) => (
                  <tr key={item.key}>
                    <th scope="row">{item.label}</th>
                    <td dir="ltr">{item.format(data.totals[item.key])}</td>
                    <td dir="ltr">
                      {item.format(data.previous.totals[item.key])}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </>
          ) : (
            <EmptyState
              title={he ? "הדוח עדיין לא זמין" : "Report not yet available"}
            />
          )}
        </div>
      </Drawer>
    </section>
  );
}
