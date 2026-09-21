import Link from "next/link";
import {
  Building2,
  Camera,
  KeyRound,
  Network,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { withLocale, type Locale } from "@/lib/i18n";
import {
  CapabilityStrip,
  ConnectedSystem,
  ConsultationBand,
  DirectionArrow,
  FeatureCheck,
  ProcessSteps,
} from "@/components/public/experience-sections";

export function SolutionDetail({
  locale,
  kind,
}: {
  locale: Locale;
  kind: "home" | "business";
}) {
  const he = locale === "he";
  const business = kind === "business";
  const content = he
    ? {
        label: business ? "פתרונות לעסקים" : "פתרונות לבית",
        title: business
          ? "העסק שלכם מתקדם.\nהאבטחה מתקדמת איתו."
          : "יותר נוחות בבית.\nיותר שקט בראש.",
        intro: business
          ? "מהחנות הראשונה ועד למשרד הבא. מתכננים את המיגון והתקשורת לפי האנשים, המרחב ושגרת העבודה שלכם."
          : "מהכניסה הראשית ועד לחדר העבודה. מצלמות, אזעקות, אינטרקום ותקשורת שמתוכננים יחד, סביב החיים בבית.",
        checks: business
          ? [
              "בקרת כניסה שמתאימה לשגרת הצוות",
              "מבט מסודר על האזורים החשובים",
              "תשתית רשת עם מחשבה על צמיחה",
            ]
          : [
              "לראות מה קורה בכניסה ובחצר",
              "לנהל את הגישה בנוחות",
              "לתכנן כיסוי רשת בכל החדרים",
            ],
        features: business
          ? [
              [
                Camera,
                "מבט רחב על העסק",
                "מגדירים את אזורי הצילום, צורכי התיעוד ואופן הגישה למערכת, תוך התחשבות בפרטיות.",
              ],
              [
                KeyRound,
                "כניסה מסודרת",
                "בוחנים דלתות, נקודות גישה וצרכים של צוותים ומבקרים כחלק מאותה תכנית.",
              ],
              [
                Network,
                "תשתית לעבודה רציפה",
                "רשת קווית, Wi-Fi וחיבור למערכות, עם התאמת התשתית לעומס ולשימוש.",
              ],
              [
                Building2,
                "מקום להתרחב",
                "מתכננים נקודות חיבור ותשתית שיאפשרו להוסיף ציוד ומרחבים בהמשך.",
              ],
            ]
          : [
              [
                Camera,
                "תמונה ברורה יותר",
                "מיקום מצלמות לפי פתחי הכניסה והאזורים החשובים, תוך התחשבות בשכנים ובפרטיות.",
              ],
              [
                ShieldCheck,
                "מיגון שמתאים לשגרה",
                "בוחנים פתחים, גלאים ואפשרויות שליטה לפי מבנה הבית וההרגלים שלכם.",
              ],
              [
                KeyRound,
                "הכניסה בידיים שלכם",
                "אינטרקום ובקרת כניסה שמותאמים לדלת, לתשתית ולשימוש היומיומי.",
              ],
              [
                Wifi,
                "מחוברים בכל חדר",
                "מתכננים מיקומי נקודות גישה וחיבורי רשת לעבודה, ללימודים ולבית המחובר.",
              ],
            ],
      }
    : {
        label: business ? "Business solutions" : "Home solutions",
        title: business
          ? "Your business moves forward.\nYour security should too."
          : "More comfort at home.\nMore peace of mind.",
        intro: business
          ? "From your first shop to your next office. Plan security and communications around your people, your space and the way you work."
          : "From the front door to your home office. Cameras, alarms, access and connectivity considered together, around everyday life.",
        checks: business
          ? [
              "Access planned around your team’s routine",
              "A clear view of the areas that matter",
              "Network infrastructure with room to grow",
            ]
          : [
              "Keep an eye on entrances and outdoor spaces",
              "Make access more convenient",
              "Plan network coverage throughout your home",
            ],
        features: business
          ? [
              [
                Camera,
                "See the bigger picture",
                "Define camera coverage, recording needs and system access while considering the privacy of staff and visitors.",
              ],
              [
                KeyRound,
                "A considered approach to access",
                "Bring doors, access points, team needs and visitor routines into one clear plan.",
              ],
              [
                Network,
                "Built for the working day",
                "Wired networks, Wi-Fi and system connectivity matched to your usage and infrastructure.",
              ],
              [
                Building2,
                "Make room for growth",
                "Plan connections and infrastructure that can accommodate more equipment and spaces later.",
              ],
            ]
          : [
              [
                Camera,
                "A clearer picture",
                "Plan camera locations around entrances and important areas, with neighbors and privacy in mind.",
              ],
              [
                ShieldCheck,
                "Security that fits your routine",
                "Consider openings, sensors and control options around the layout of your home and daily habits.",
              ],
              [
                KeyRound,
                "A more welcoming entrance",
                "Intercom and access options matched to your door, existing infrastructure and everyday use.",
              ],
              [
                Wifi,
                "Connected in every room",
                "Plan access points and wired connections for work, learning and life in a connected home.",
              ],
            ],
      };
  return (
    <>
      <section className="miro-container experience-reading">
        <nav
          className="experience-breadcrumb"
          aria-label={he ? "פירורי לחם" : "Breadcrumb"}
        >
          <Link href={withLocale(locale)}>{he ? "בית" : "Home"}</Link>
          <span>/</span>
          <Link href={withLocale(locale, "services")}>
            {he ? "פתרונות" : "Solutions"}
          </Link>
          <span>/</span>
          <span>{content.label}</span>
        </nav>
        <div className="experience-system-layout">
          <div className="experience-reading-heading">
            <p className="experience-overline">{content.label}</p>
            <h1 className="experience-solution-title">{content.title}</h1>
            <p className="experience-description">{content.intro}</p>
            <ul className="experience-checks">
              {content.checks.map((check) => (
                <FeatureCheck key={check}>{check}</FeatureCheck>
              ))}
            </ul>
            <div className="experience-actions">
              <Link
                href={withLocale(locale, "contact")}
                className="miro-button miro-button-primary"
              >
                {he ? "נתכנן את המרחב שלכם" : "Plan your space"}
                <DirectionArrow locale={locale} />
              </Link>
            </div>
          </div>
          <ConnectedSystem locale={locale} />
        </div>
        <div className="experience-detail-features">
          {content.features.map(([Icon, title, copy]) => {
            const FeatureIcon = Icon as typeof Camera;
            return (
              <article className="experience-value" key={title as string}>
                <span className="experience-icon">
                  <FeatureIcon aria-hidden="true" />
                </span>
                <h2>{title as string}</h2>
                <p>{copy as string}</p>
              </article>
            );
          })}
        </div>
      </section>
      <div className="experience-capability-band">
        <div className="miro-container">
          <CapabilityStrip locale={locale} />
        </div>
      </div>
      <section className="experience-section">
        <div className="miro-container">
          <div className="experience-section-heading">
            <div>
              <p className="experience-overline">
                {he ? "מהרעיון לתכנית" : "FROM IDEA TO A CLEAR PLAN"}
              </p>
              <h2 className="experience-heading">
                {he
                  ? "כל פרויקט מתחיל בהיכרות."
                  : "Every project starts with understanding."}
              </h2>
            </div>
          </div>
          <ProcessSteps locale={locale} />
        </div>
      </section>
      <ConsultationBand locale={locale} />
    </>
  );
}
