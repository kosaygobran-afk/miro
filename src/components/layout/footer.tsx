import Link from "next/link";
import { ArrowLeft, ArrowRight, MessageSquareText } from "lucide-react";
import { withLocale, type Locale } from "@/lib/i18n";
import { Brand } from "@/components/layout/brand";

export function Footer({ locale }: { locale: Locale }) {
  const he = locale === "he";
  const Arrow = he ? ArrowLeft : ArrowRight;
  const links = [
    ["", he ? "בית" : "Home"],
    ["store", he ? "חנות המוצרים" : "Explore the store"],
    ["services", he ? "הפתרונות שלנו" : "Our solutions"],
    ["about", he ? "אודות מירו" : "About MIRO"],
    ["contact", he ? "יצירת קשר" : "Get in touch"],
  ];
  const solutions = [
    ["services/home", he ? "אבטחה לבית" : "Home security"],
    ["services/business", he ? "אבטחה לעסק" : "Business security"],
    ["services/security-cameras", he ? "מצלמות אבטחה" : "Security cameras"],
    [
      "services/intercom-access",
      he ? "אינטרקום ובקרת כניסה" : "Intercom & access",
    ],
    ["services/network-wifi", he ? "רשת ותקשורת" : "Networks & connectivity"],
  ];
  const legal = [
    ["privacy", he ? "פרטיות" : "Privacy"],
    ["terms", he ? "תנאי שימוש" : "Terms"],
    ["accessibility", he ? "נגישות" : "Accessibility"],
  ];
  return (
    <footer className="miro-footer premium-footer">
      <div className="miro-container premium-footer-main">
        <div className="premium-footer-brand">
          <Link
            href={withLocale(locale)}
            aria-label={he ? "דף הבית של מירו" : "MIRO home"}
          >
            <Brand locale={locale} />
          </Link>
          <p>
            {he
              ? "מחברים בין טכנולוגיה, אנשים ושקט נפשי. פתרונות מיגון ותקשורת שנבנים סביב המקום שלכם."
              : "Connecting technology, people, and peace of mind. Security and communication solutions built around your space."}
          </p>
          <span className="premium-footer-motto" dir="ltr">
            A SAFER, SMARTER EVERYDAY.
          </span>
        </div>
        <div className="premium-footer-column">
          <h2>{he ? "מכירים את מירו" : "Discover MIRO"}</h2>
          <nav aria-label={he ? "ניווט תחתון" : "Footer navigation"}>
            {links.map(([path, label]) => (
              <Link key={path} href={withLocale(locale, path)}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="premium-footer-column">
          <h2>{he ? "פתרון לכל מקום" : "For every space"}</h2>
          <nav aria-label={he ? "פתרונות מיגון ותקשורת" : "Security solutions"}>
            {solutions.map(([path, label]) => (
              <Link key={path} href={withLocale(locale, path)}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="premium-footer-column premium-footer-consult">
          <MessageSquareText size={25} strokeWidth={1.5} aria-hidden="true" />
          <h2>
            {he ? "מתחילים בשיחה טובה." : "It starts with a conversation."}
          </h2>
          <p>
            {he
              ? "בית חדש, עסק בצמיחה או שדרוג מערכת קיימת — בואו נמצא את הכיוון המתאים."
              : "A new home, a growing business, or an existing system. Let’s find the right direction."}
          </p>
          <Link href={withLocale(locale, "contact")}>
            {he ? "נדבר על הפרויקט שלכם" : "Tell us about your project"}
            <Arrow size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="premium-footer-bottom">
        <div className="miro-container">
          <span>
            © {new Date().getFullYear()}{" "}
            {he
              ? "מירו. מערכות מיגון ותקשורת."
              : "MIRO. Security & Communications."}
          </span>
          <nav
            className="premium-footer-legal"
            aria-label={he ? "מידע משפטי ונגישות" : "Legal and accessibility"}
          >
            {legal.map(([path, label]) => (
              <Link key={path} href={withLocale(locale, path)}>
                {label}
              </Link>
            ))}
          </nav>
          <span className="premium-preview-label">
            {he
              ? "תצוגה מקדימה · תוכן להמחשה"
              : "Design preview · Illustrative content"}
          </span>
        </div>
      </div>
    </footer>
  );
}
