import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  Check,
  ChevronDown,
  ClipboardList,
  Home,
  KeyRound,
  Layers3,
  LockKeyhole,
  Network,
  ShieldCheck,
  SlidersHorizontal,
  Wifi,
} from "lucide-react";
import { withLocale, type Locale } from "@/lib/i18n";
import { serviceIcons } from "@/lib/service-content";

// Editable presentation content. Confirm scope and wording with the business owner before launch.
export const experienceCategories = {
  he: [
    {
      id: "security-cameras",
      title: "מצלמות אבטחה",
      description: "תמונה ברורה. נקודת מבט רחבה יותר.",
      detail: "תכנון מיקום, זוויות צפייה והקלטה בהתאם למרחב ולצורך.",
      tag: "לראות את התמונה המלאה",
    },
    {
      id: "alarm-systems",
      title: "מערכות אזעקה",
      description: "עוד שכבה של ביטחון, בבית ובעסק.",
      detail: "חיישנים, גילוי ותכנון התרעות כחלק ממערך מיגון משולב.",
      tag: "לדעת מה קורה",
    },
    {
      id: "intercom-access",
      title: "אינטרקום ובקרת כניסה",
      description: "השליטה מתחילה כבר בדלת.",
      detail: "אינטרקום וידאו וניהול הרשאות כניסה לפי אופי הנכס.",
      tag: "להחליט מי נכנס",
    },
    {
      id: "network-wifi",
      title: "רשתות ו־Wi-Fi",
      description: "התשתית שמחברת את הכול.",
      detail: "כבילה, נקודות גישה ותכנון כיסוי למכשירים ולמשתמשים.",
      tag: "להישאר מחוברים",
    },
  ],
  en: [
    {
      id: "security-cameras",
      title: "Security cameras",
      description: "A clearer picture. A wider perspective.",
      detail:
        "Camera placement, viewing angles and recording planned around your space.",
      tag: "See the bigger picture",
    },
    {
      id: "alarm-systems",
      title: "Alarm systems",
      description: "Another layer of security for your space.",
      detail:
        "Sensors, detection and alert planning as part of a connected security system.",
      tag: "Know what is happening",
    },
    {
      id: "intercom-access",
      title: "Intercom & access",
      description: "More control starts at the door.",
      detail:
        "Video intercoms and entry permissions shaped around how your property is used.",
      tag: "Choose who comes in",
    },
    {
      id: "network-wifi",
      title: "Networks & Wi-Fi",
      description: "The connection behind everything.",
      detail:
        "Structured cabling, access points and coverage planning for people and devices.",
      tag: "Keep your world connected",
    },
  ],
};

export function DirectionArrow({
  locale,
  className = "size-4",
}: {
  locale: Locale;
  className?: string;
}) {
  const Icon = locale === "he" ? ArrowLeft : ArrowRight;
  return <Icon className={className} aria-hidden="true" />;
}

export function ServiceCategoryGrid({
  locale,
  compact = false,
}: {
  locale: Locale;
  compact?: boolean;
}) {
  return (
    <div
      className={`experience-category-grid${compact ? " experience-category-grid-compact" : ""}`}
    >
      {experienceCategories[locale].map((category, index) => {
        const Icon = serviceIcons[category.id] || LockKeyhole;
        return (
          <Link
            href={withLocale(locale, `services/${category.id}`)}
            key={category.id}
            className="experience-category-card"
          >
            <div className="experience-category-top">
              <span className="experience-icon">
                <Icon aria-hidden="true" />
              </span>
              <span className="experience-card-index" aria-hidden="true">
                0{index + 1}
              </span>
            </div>
            <div>
              <h3>{category.title}</h3>
              <p>{compact ? category.description : category.detail}</p>
            </div>
            <span className="experience-card-link">
              {compact ? (
                <DirectionArrow locale={locale} />
              ) : (
                <>
                  {category.tag}
                  <DirectionArrow locale={locale} />
                </>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function CapabilityStrip({ locale }: { locale: Locale }) {
  const content =
    locale === "he"
      ? ([
          [SlidersHorizontal, "תכנון לפי המרחב", "מתחילים מהצרכים שלכם"],
          [Layers3, "מערכת שלמה", "מיגון, כניסה ותקשורת"],
          [ClipboardList, "תהליך ברור", "מהאפיון ועד למסירה"],
          [Network, "מחשבה קדימה", "תשתית עם מקום לצמוח"],
        ] as const)
      : ([
          [
            SlidersHorizontal,
            "Designed for your space",
            "Your needs come first",
          ],
          [Layers3, "One connected approach", "Security, access and networks"],
          [ClipboardList, "A clear process", "From brief to handover"],
          [Network, "Room to grow", "Plan for what comes next"],
        ] as const);
  return (
    <div className="experience-capabilities">
      {content.map(([Icon, title, detail]) => (
        <div key={title}>
          <Icon aria-hidden="true" />
          <span>
            <strong>{title}</strong>
            <small>{detail}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

export function SolutionCards({ locale }: { locale: Locale }) {
  const items =
    locale === "he"
      ? [
          {
            icon: Home,
            label: "PRIVATE SPACES",
            title: "בית שמרגיש בטוח יותר.",
            copy: "מהכניסה הראשית ועד לחיבור בחדר העבודה. מתכננים סביב החיים בבית.",
            tags: ["מצלמות", "אינטרקום", "Wi-Fi"],
            href: "services/home",
            theme: "home",
          },
          {
            icon: Building2,
            label: "BUSINESS SPACES",
            title: "ראש שקט לעסק שלכם.",
            copy: "משרדים, חנויות ומרחבי עבודה. מחברים בין אבטחה לשגרת העסק.",
            tags: ["בקרת כניסה", "רשתות", "תיעוד"],
            href: "services/business",
            theme: "business",
          },
          {
            icon: Network,
            label: "CONNECTED SPACES",
            title: "יותר חיבורים. פחות סיבוכים.",
            copy: "מרחב חדש או מערכת קיימת? תכנון תשתית מסודרת מתחיל בתמונה הכוללת.",
            tags: ["תכנון כיסוי", "כבילה", "הרחבה"],
            href: "services/network-wifi",
            theme: "network",
          },
        ]
      : [
          {
            icon: Home,
            label: "PRIVATE SPACES",
            title: "Make yourself at home.",
            copy: "From the front door to your home office. A system planned around everyday life.",
            tags: ["Cameras", "Intercom", "Wi-Fi"],
            href: "services/home",
            theme: "home",
          },
          {
            icon: Building2,
            label: "BUSINESS SPACES",
            title: "Focus on your business.",
            copy: "Offices, shops and workspaces. Bring security into the rhythm of your business.",
            tags: ["Access", "Networks", "Recording"],
            href: "services/business",
            theme: "business",
          },
          {
            icon: Network,
            label: "CONNECTED SPACES",
            title: "Everything, connected.",
            copy: "A new space or an existing setup? A well-planned network starts with the bigger picture.",
            tags: ["Coverage", "Cabling", "Expansion"],
            href: "services/network-wifi",
            theme: "network",
          },
        ];
  return (
    <div className="experience-solutions">
      {items.map(({ icon: Icon, ...item }) => (
        <Link
          key={item.theme}
          href={withLocale(locale, item.href)}
          className={`experience-solution-card experience-solution-${item.theme}`}
        >
          <div className="experience-solution-art" aria-hidden="true">
            <span className="experience-art-orbit" />
            <Icon strokeWidth={0.8} />
            <span className="experience-art-point" />
            <span className="experience-art-label">MIRO / {item.label}</span>
          </div>
          <div className="experience-solution-copy">
            <p className="experience-overline" lang="en" dir="ltr">
              {item.label}
            </p>
            <h3>{item.title}</h3>
            <p>{item.copy}</p>
            <div className="experience-tags">
              {item.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <span className="experience-card-link">
              {locale === "he" ? "לגלות את הפתרון" : "Explore the solution"}
              <DirectionArrow locale={locale} />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function ConnectedSystem({ locale }: { locale: Locale }) {
  const he = locale === "he";
  const nodes = [
    {
      Icon: Camera,
      title: he ? "מצלמות" : "Cameras",
      text: he ? "לראות" : "See",
    },
    {
      Icon: ShieldCheck,
      title: he ? "מערכות אזעקה" : "Alarms",
      text: he ? "לדעת" : "Know",
    },
    {
      Icon: KeyRound,
      title: he ? "בקרת כניסה" : "Access",
      text: he ? "לנהל" : "Manage",
    },
    {
      Icon: Wifi,
      title: he ? "רשתות ותקשורת" : "Networks",
      text: he ? "לחבר" : "Connect",
    },
  ];
  return (
    <div
      className="experience-system-diagram"
      role="img"
      aria-label={
        he
          ? "מצלמות, אזעקות, בקרת כניסה ורשתות בתכנון משולב"
          : "Cameras, alarms, access and networks in one connected plan"
      }
    >
      <div className="experience-system-lines" aria-hidden="true" />
      <div className="experience-system-core" aria-hidden="true">
        <span>MIRO</span>
        <small>CONNECTED SECURITY</small>
      </div>
      {nodes.map(({ Icon, title, text }, i) => (
        <div
          className={`experience-system-node experience-node-${i + 1}`}
          key={title}
          aria-hidden="true"
        >
          <Icon />
          <span>{title}</span>
          <small>{text}</small>
        </div>
      ))}
      <span className="experience-diagram-caption" aria-hidden="true">
        {he
          ? "כל החיבורים. תמונה אחת."
          : "Every connection. One clear picture."}
      </span>
    </div>
  );
}

export function ProcessSteps({ locale }: { locale: Locale }) {
  const steps =
    locale === "he"
      ? [
          [
            "מכירים את המרחב",
            "מגדירים יחד את סוג הנכס, הצרכים והדברים שחשובים לכם.",
          ],
          [
            "מתכננים את החיבורים",
            "בוחנים מיקומים, תשתיות ואפשרויות ומתאימים את המפרט.",
          ],
          [
            "מגדירים הצעה ברורה",
            "מרכזים את הציוד, העבודה והיקף השירות להצעה מסודרת.",
          ],
          ["מתקדמים לביצוע", "מתאמים התקנה, בדיקות והדרכה בהתאם להצעה שתאושר."],
        ]
      : [
          [
            "Understand your space",
            "Start with your property, your needs and the things that matter to you.",
          ],
          [
            "Plan the connections",
            "Review locations, infrastructure and options to shape the specification.",
          ],
          [
            "Define a clear proposal",
            "Bring equipment, installation and service scope into one considered proposal.",
          ],
          [
            "Put the plan in motion",
            "Coordinate installation, checks and handover around the agreed proposal.",
          ],
        ];
  return (
    <div className="experience-process">
      {steps.map(([title, copy], index) => (
        <div className="experience-process-step" key={title}>
          <span className="experience-process-number">0{index + 1}</span>
          <h3>{title}</h3>
          <p>{copy}</p>
        </div>
      ))}
    </div>
  );
}

export function FaqSection({ locale }: { locale: Locale }) {
  const items =
    locale === "he"
      ? [
          [
            "איך מתחילים לבחור מערכת?",
            "מתחילים מסוג הנכס, אזורי הכיסוי והדרך שבה משתמשים במרחב. כדאי להכין תכנית או תיאור קצר, ולציין אם כבר קיימת תשתית. מכאן אפשר לבנות מפרט מתאים.",
          ],
          [
            "אפשר לשדרג מערכת קיימת?",
            "לעיתים אפשר לשלב ציוד קיים. ההתאמה תלויה בדגמים, בתשתיות ובמצב המערכת, ולכן בודקים אותם לפני שמחליטים מה לשמור ומה לשדרג.",
          ],
          [
            "מה משפיע על הצעת המחיר?",
            "מספר נקודות הקצה, סוג הציוד, התשתית, מורכבות ההתקנה והיקף השירות. המחיר והזמינות נקבעים בהצעה מפורטת לאחר בירור הצרכים.",
          ],
          [
            "אפשר להזמין דרך האתר?",
            "האתר נמצא כעת בתצוגת הדגמה. הקטלוג נועד להתרשמות, והזמנות ושליחת פניות עדיין אינן פעילות. פרטי השירות והמחירים כפופים לאישור לפני ההשקה.",
          ],
        ]
      : [
          [
            "Where do I start with a new system?",
            "Start with your property type, the areas you want to cover and how the space is used. A floor plan or short description, including any existing infrastructure, helps shape a suitable specification.",
          ],
          [
            "Can I upgrade an existing system?",
            "Existing equipment may be reusable. Compatibility depends on the models, cabling and condition of the system, so these need to be reviewed before deciding what to keep or upgrade.",
          ],
          [
            "What goes into a quote?",
            "The number of devices, equipment choices, infrastructure, installation complexity and service scope. Pricing and availability are confirmed in a detailed proposal after reviewing your needs.",
          ],
          [
            "Can I order through the website?",
            "The website is currently a design preview. The catalog is for exploration; orders and enquiry submission are not yet active. Service details and prices need approval before launch.",
          ],
        ];
  return (
    <section className="experience-section">
      <div className="miro-container experience-faq-layout">
        <div>
          <p className="experience-overline">
            {locale === "he" ? "טוב לדעת" : "GOOD TO KNOW"}
          </p>
          <h2 className="experience-heading">
            {locale === "he"
              ? "שאלות טובות.\nתשובות ברורות."
              : "Good questions.\nClear answers."}
          </h2>
          <p className="experience-description">
            {locale === "he"
              ? "כמה דברים שכדאי לדעת לפני שמחברים את הכול."
              : "A few things to know before bringing everything together."}
          </p>
        </div>
        <div className="experience-faq">
          {items.map(([question, answer]) => (
            <details key={question} name="experience-faq">
              <summary>
                {question}
                <ChevronDown aria-hidden="true" />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ConsultationBand({ locale }: { locale: Locale }) {
  return (
    <section className="experience-section experience-section-last">
      <div className="miro-container">
        <div className="experience-consultation">
          <div>
            <p className="experience-overline">
              {locale === "he"
                ? "החיבור הבא מתחיל כאן"
                : "YOUR NEXT CONNECTION STARTS HERE"}
            </p>
            <h2>
              {locale === "he"
                ? "בואו נתכנן מרחב חכם יותר."
                : "Let’s plan a smarter space."}
            </h2>
            <p>
              {locale === "he"
                ? "לבית, לעסק ולכל מה שחשוב לכם. מתחילים עם הצורך שלכם."
                : "For your home, your business and everything that matters to you."}
            </p>
          </div>
          <Link
            href={withLocale(locale, "contact")}
            className="miro-button miro-button-primary"
          >
            {locale === "he" ? "לתכנון והצעת מחיר" : "Plan your project"}
            <DirectionArrow locale={locale} />
          </Link>
          <ShieldCheck
            className="experience-consultation-watermark"
            aria-hidden="true"
          />
        </div>
      </div>
    </section>
  );
}

export function FeatureCheck({ children }: { children: React.ReactNode }) {
  return (
    <li>
      <Check aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}
