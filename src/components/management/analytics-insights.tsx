"use client";

import { useMemo } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart2,
  Eye,
  MessageCircle,
  MessageSquare,
  MousePointerClick,
  Phone,
  Search,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import Link from "@/components/motion/motion-link";
import {
  contactChannelMix,
  searchCoverage,
  summarizeDailyActivity,
} from "@/lib/report-insights";
import type { AnalyticsResponse } from "./analytics-dashboard";
import { formatCount, formatPercent } from "./analytics-dashboard.copy";
import { InsightCard, InsightSectionHeader } from "./ui/insight-card";
import { reportingStyles as report } from "./ui/reporting-workspace";

export function AnalyticsInsights({
  data,
  locale,
}: {
  data: AnalyticsResponse;
  locale: "he" | "en";
}) {
  const he = locale === "he";
  const totals = data.totals;
  const daily = useMemo(
    () =>
      summarizeDailyActivity(
        Object.entries(data.dailySeries).map(([day, types]) => ({
          day,
          events: Object.values(types).reduce(
            (sum, row) => sum + row.events,
            0,
          ),
        })),
      ),
    [data.dailySeries],
  );
  const coverage = searchCoverage(totals.searches, totals.noResultSearches);
  const channels = contactChannelMix(totals.contactClicks);
  const channelLabels = {
    phone: he ? "טלפון" : "Phone",
    whatsapp: he ? "וואטסאפ" : "WhatsApp",
    contact: he ? "טופס פנייה" : "Contact form",
  };
  const channelIcons = {
    phone: Phone,
    whatsapp: MessageCircle,
    contact: MessageSquare,
  };
  const lead = channels.leaders[0];
  const opportunity = [...data.perProduct]
    .filter((product) => product.views > 0 && product.enquiries === 0)
    .sort((first, second) => second.views - first.views)[0];
  const productLabel = opportunity
    ? ((he ? opportunity.name.he : opportunity.name.en) ??
      opportunity.name.en ??
      opportunity.name.he ??
      (he ? "מוצר ללא שם" : "Unnamed product"))
    : null;
  const dayLabel = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(he ? "he-IL" : "en-IL", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const comparison = daily?.comparison;
  const sourceLabels = {
    events: he ? "אירועי שימוש שנמדדו" : "Measured usage events",
    requests: he ? "בקשות שנשמרו במסד" : "Requests saved in the database",
    orders: he ? "הזמנות מהמכירות" : "Orders from sales records",
  };

  return (
    <div className="insight-analytics-stack motion-content-reveal">
      <InsightSectionHeader
        title={he ? "מה הנתונים אומרים עכשיו" : "What the figures say now"}
        description={
          he
            ? "שלוש נקודות לקריאה מהירה, עם המספרים וההקשר שמאחוריהן."
            : "Three signals for a quick read, with the figures and context behind them."
        }
        icon={<Activity />}
      />
      <div className="insight-summary-grid">
        <InsightCard
          title={he ? "קצב הפעילות שנמדדה" : "Recorded activity pace"}
          icon={<TrendingUp />}
          value={
            comparison?.change != null
              ? `${comparison.change > 0 ? "+" : ""}${formatPercent(comparison.change, locale)}`
              : daily
                ? formatCount(daily.total, locale)
                : "—"
          }
          description={
            comparison
              ? he
                ? `${formatCount(comparison.recent.total, locale)} אירועים בחלון האחרון מול ${formatCount(comparison.earlier.total, locale)} בקודם, בשני חלונות של ${comparison.windowDays} ימים.`
                : `${formatCount(comparison.recent.total, locale)} events in the recent window versus ${formatCount(comparison.earlier.total, locale)} earlier, across two ${comparison.windowDays}-day windows.`
              : he
                ? "נדרשים לפחות שני ימי כיסוי כדי להשוות קצב. אין כאן השוואה לטווח דיווח קודם."
                : "At least two days of coverage are needed to compare pace. This does not compare the previous reporting period."
          }
          detail={
            comparison
              ? `${dayLabel(comparison.earlier.from)}–${dayLabel(comparison.earlier.to)} / ${dayLabel(comparison.recent.from)}–${dayLabel(comparison.recent.to)} · UTC`
              : he
                ? "המדד מתייחס לכיסוי התרשים היומי בלבד."
                : "This measure uses the daily chart coverage only."
          }
        />
        <InsightCard
          title={he ? "חיפושים ללא התאמה" : "Searches without a match"}
          icon={<Search />}
          value={
            coverage.noResultRate === null
              ? "—"
              : formatPercent(coverage.noResultRate, locale)
          }
          description={
            !coverage.valid
              ? he
                ? "מספר אירועי חיפוש ללא תוצאות גבוה ממספר החיפושים. יש לבדוק את המדידה לפני הסקת מסקנות."
                : "No-result events exceed search events. Review the measurements before drawing conclusions."
              : totals.searches > 0
                ? he
                  ? `${formatCount(totals.noResultSearches, locale)} מתוך ${formatCount(totals.searches, locale)} חיפושים לא החזירו מוצר. בדקו מונחים, שמות וקטגוריות בקטלוג.`
                  : `${formatCount(totals.noResultSearches, locale)} of ${formatCount(totals.searches, locale)} searches returned no products. Review catalog terms, names and categories.`
                : he
                  ? "אין אירועי חיפוש בטווח שנבחר, ולכן שיעור התאמה עדיין אינו זמין."
                  : "No searches were recorded in this range, so a match rate is not yet available."
          }
          detail={
            he
              ? "הספירה היא של אירועים; חיפושים חוזרים של אותו אדם נספרים שוב."
              : "These are event counts; repeated searches by one person count again."
          }
          action={{
            href: `/${locale}/admin/categories`,
            label: he ? "בדיקת הקטגוריות" : "Review categories",
          }}
        />
        <InsightCard
          title={he ? "ערוץ הפנייה המוביל" : "Leading contact channel"}
          icon={<Phone />}
          value={
            channels.leaders.length > 1
              ? he
                ? "מובילים במשותף"
                : "Shared lead"
              : lead
                ? channelLabels[lead.key]
                : "—"
          }
          description={
            lead
              ? he
                ? `${channels.leaders.map((channel) => channelLabels[channel.key]).join(" / ")} עם ${formatCount(lead.count, locale)} לחיצות לכל ערוץ, מתוך ${formatCount(channels.total, locale)} לחיצות פנייה.`
                : `${channels.leaders.map((channel) => channelLabels[channel.key]).join(" / ")} recorded ${formatCount(lead.count, locale)} clicks per channel, out of ${formatCount(channels.total, locale)} contact clicks.`
              : he
                ? "לא נמדדו לחיצות על ערוצי הפנייה בטווח הזה."
                : "No contact channel clicks were recorded in this range."
          }
          detail={
            he
              ? "לחיצה אינה שיחה שהתקבלה או פנייה שנשלחה."
              : "A click does not confirm a completed call or a submitted request."
          }
          action={{
            href: `/${locale}/admin/requests`,
            label: he ? "מעבר לפניות שנשמרו" : "Open saved requests",
          }}
        />
      </div>
      <div className="insight-columns">
        <section className={report.panel}>
          <InsightSectionHeader
            title={he ? "מפת הפעילות" : "Activity map"}
            description={
              he
                ? "שישה מדדים עצמאיים. מקורות שונים, בלי ייחוס אוטומטי בין השלבים."
                : "Six independent measures. Different sources, without automatic attribution between stages."
            }
            icon={<BarChart2 />}
          />
          <div className="insight-activity-map">
            {[
              {
                label: he ? "חשיפות מוצר" : "Product impressions",
                count: totals.impressions,
                source: sourceLabels.events,
              },
              {
                label: he ? "צפיות בפרטי מוצר" : "Product detail views",
                count: totals.views,
                source: sourceLabels.events,
              },
              {
                label: he ? "לחיצות פנייה" : "Contact clicks",
                count: totals.contactClicks.total,
                source: sourceLabels.events,
              },
              {
                label: he ? "אירועי בקשת מידע" : "Enquiry click events",
                count: totals.productInquiries,
                source: sourceLabels.events,
              },
              {
                label: he ? "בקשות שנשלחו" : "Submitted requests",
                count: totals.enquiriesSubmitted,
                source: sourceLabels.requests,
              },
              {
                label: he ? "הזמנות שנרשמו" : "Recorded orders",
                count: totals.salesCount,
                source: sourceLabels.orders,
              },
            ].map((item) => (
              <div className="insight-activity-cell" key={item.label}>
                <span>{item.label}</span>
                <strong>
                  {item.count === null ? "—" : formatCount(item.count, locale)}
                </strong>
                <small>{item.source}</small>
              </div>
            ))}
          </div>
          <p className={report.muted}>
            {he
              ? "אירועי צפייה, לחיצה ופנייה עשויים להגיע מאותו אדם יותר מפעם אחת. בקשות ומכירות אינן משויכות לסשנים בדוח זה; אין כאן משפך לקוחות או שיעור מכירה."
              : "Views, clicks and enquiry events may repeat for one person. Requests and sales are not linked to sessions in this report; this is not a customer funnel or sales conversion rate."}
          </p>
        </section>
        <section className={report.panel}>
          <InsightSectionHeader
            title={he ? "תמהיל ערוצי הפנייה" : "Contact channel mix"}
            description={
              he
                ? "החלק של כל ערוץ מתוך לחיצות הפנייה שנמדדו."
                : "Each channel's share of measured contact clicks."
            }
            icon={<MousePointerClick />}
          />
          <dl className="insight-channel-list">
            {channels.entries.map((channel) => {
              const Icon = channelIcons[channel.key];
              const countLabel = `${formatCount(channel.count, locale)} · ${channels.total > 0 ? formatPercent(channel.share, locale) : "—"}`;
              return (
                <div key={channel.key}>
                  <dt className="insight-channel-label">
                    <span>
                      <Icon size={17} aria-hidden="true" />
                      {channelLabels[channel.key]}
                    </span>
                    <span aria-hidden="true">{countLabel}</span>
                  </dt>
                  <dd>
                    <span className="sr-only">{countLabel}</span>
                    <div className="insight-track" aria-hidden="true">
                      <span style={{ inlineSize: `${channel.share * 100}%` }} />
                    </div>
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className={report.muted}>
            {he
              ? "אין נתוני משך שיחה, תוכן וואטסאפ או מספר הפניות שהתקבלו בכל ערוץ."
              : "Call duration, WhatsApp message contents and completed requests per channel are not available."}
          </p>
        </section>
      </div>
      {opportunity ? (
        <InsightCard
          title={he ? "מוצר שכדאי לבדוק" : "A product to review"}
          icon={<Eye />}
          value={productLabel}
          description={
            he
              ? `${formatCount(opportunity.views, locale)} אירועי צפייה וללא אירועי בקשת מידע בקבוצת עשרת המוצרים המובילים שהוחזרה. בדקו שהתיאור, המפרט ואפשרויות הפנייה ברורים.`
              : `${formatCount(opportunity.views, locale)} detail-view events and no enquiry click events in the returned top-ten cohort. Review whether the description, specifications and contact options are clear.`
          }
          detail={
            he
              ? "זהו סימן לבדיקה, ולא הוכחה לביקוש אבוד או למכירה שלא הושלמה."
              : "This is a prompt to review, not proof of lost demand or a failed sale."
          }
          action={{
            href: `/${locale}/admin/products/${opportunity.productId}`,
            label: he ? "בדיקת המוצר" : "Review product",
          }}
        />
      ) : null}
      <details className="insight-definition">
        <summary>
          {he
            ? "מקורות הנתונים ומה כל מדד אומר"
            : "Data sources and what each measure means"}
        </summary>
        <dl>
          <div>
            <dt>{he ? "אירועים וסשנים" : "Events and sessions"}</dt>
            <dd>
              {he
                ? "הצפיות, החשיפות, החיפושים ולחיצות הפנייה מגיעים מאירועי החנות שנמדדו. מזהה סשן אינו אדם מזוהה; מדידה חסומה או לא זמינה לא נכללת."
                : "Views, impressions, searches and contact clicks come from measured storefront events. A session identifier is not an identified person; blocked or unavailable measurements are absent."}
            </dd>
          </div>
          <div>
            <dt>{he ? "אירועים מול בקשות" : "Events versus requests"}</dt>
            <dd>
              {he
                ? "בקשת מידע היא אירוע לחיצה. פניות שנשלחו הן רשומות service_requests שנשמרו בטווח. אין ייחוס אוטומטי בין שתי הספירות."
                : "An enquiry is a click event. Submitted requests count saved service_requests records in the range. These counts are not automatically attributed to each other."}
            </dd>
          </div>
          <div>
            <dt>{he ? "כיסוי התרשים היומי" : "Daily chart coverage"}</dt>
            <dd>
              {he
                ? "התרשים מבוסס על סיכומי UTC יומיים, ולכן ימי הקצה עשויים לכלול אירועים מחוץ לשעות הטווח שנבחר. השוואת הקצב מחלקת את כיסוי התרשים לשני חלונות שווים, עם אפס בימים ללא אירועים; ביום אמצעי עודף אין שימוש בהשוואה."
                : "The chart uses whole UTC-day aggregates, so boundary days may include events outside the selected time window. Pace compares two equal windows across chart coverage, counting missing event days as zero; an extra middle day is omitted from that comparison."}
            </dd>
          </div>
          <div>
            <dt>{he ? "מוצרים והזמנות" : "Products and orders"}</dt>
            <dd>
              {he
                ? "פירוט המוצרים מוגבל לעשרת המובילים לפי צפיות. צופים ייחודיים למוצר מבוססים על עד 5,000 אירועים אחרונים. הזמנות מגיעות מנתוני המכירות, ללא שיוך לצפייה או ללחיצה."
                : "Product detail is limited to the ten leaders by views. Per-product unique viewers use up to 5,000 recent events. Orders come from sales records, without attribution to a view or click."}
            </dd>
          </div>
        </dl>
      </details>
      <Link href={`/${locale}/admin/finance`} className="insight-card-link">
        <ShoppingBag size={17} aria-hidden="true" />
        {he ? "לבדיקת המכירות והרווח" : "Review recorded sales and profit"}
        <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}
