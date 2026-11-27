import {
  Boxes,
  Camera,
  Cctv,
  Cloud,
  Cpu,
  DoorOpen,
  Headphones,
  MonitorSmartphone,
  Radio,
  Router,
  Siren,
  Unplug,
  Wrench,
  PanelsTopLeft,
  type LucideIcon,
} from "lucide-react";
import type { PublishedService } from "@/lib/public-services";

type Guide = { icon: LucideIcon; he: [string, string]; en: [string, string] };

// Canonical service slugs and the published English names of owner-created services.
// A numeric slug alone does not identify the subject of a service.
const guides = new Map<string, Guide>([
  [
    "security-cameras",
    {
      icon: Cctv,
      en: [
        "Camera planning starts with what you need to recognise at each location. Viewing distance, night lighting and the recording period guide the choice of lens, recorder and storage.",
        "List the entrances or areas to cover, the days of recording you need and any cameras or recorder you want to reuse.",
      ],
      he: [
        "תכנון מצלמות מתחיל בשאלה מה צריך לזהות בכל נקודה. מרחק הצילום, התאורה בלילה ומשך שמירת ההקלטות משפיעים על בחירת העדשה, המקליט ונפח האחסון.",
        "הכינו רשימה של האזורים לצילום, מספר ימי השמירה הרצוי ודגמי הציוד שתרצו להשאיר.",
      ],
    },
  ],
  [
    "alarm-systems",
    {
      icon: Radio,
      en: [
        "Door contacts and motion detectors cover different parts of a property. Planning by zone lets you protect an entrance while other rooms are in use.",
        "Note which rooms stay occupied at night, any pets, and who should receive an alert. Include the panel model when upgrading.",
      ],
      he: [
        "גלאי פתיחה וגלאי תנועה נותנים מענה לחלקים שונים בנכס. חלוקה לאזורים מאפשרת לדרוך את הכניסה גם כשחדרים אחרים עדיין בשימוש.",
        "ציינו אילו חדרים בשימוש בלילה, האם יש חיות מחמד ומי אמור לקבל התראה. בשדרוג מערכת, הוסיפו את דגם הרכזת.",
      ],
    },
  ],
  [
    "intercom-access",
    {
      icon: DoorOpen,
      en: [
        "An entry system brings the outdoor call station, indoor answering point and door release together. The choice depends on the lock, existing wiring and who needs access.",
        "Count the doors and answering points. Note whether residents, staff or occasional visitors need separate entry permissions.",
      ],
      he: [
        "מערכת כניסה מחברת בין פנל החוץ, נקודת המענה והמנעול החשמלי. בחירת הרכיבים תלויה בסוג הדלת, בחיווט הקיים ובאנשים שצריכים להיכנס.",
        "ספרו את הדלתות ונקודות המענה. ציינו אם נדרשות הרשאות נפרדות לדיירים, לעובדים או למבקרים.",
      ],
    },
  ],
  [
    "network-wifi",
    {
      icon: Router,
      en: [
        "A network plan maps wired outlets and wireless coverage together. Room layout, wall materials and the devices in use help determine switch capacity and access point placement.",
        "Mark the router, existing outlets and weak-signal areas on a simple floor plan. Count devices that need a cable connection.",
      ],
      he: [
        "תכנון רשת משלב בין נקודות קוויות לכיסוי אלחוטי. מבנה החדרים, סוג הקירות ומספר המכשירים קובעים היכן למקם נקודות גישה וכמה חיבורים דרושים במתג.",
        "סמנו בתרשים את הנתב, השקעים הקיימים והאזורים שבהם הקליטה חלשה. ספרו אילו מכשירים דורשים חיבור בכבל.",
      ],
    },
  ],
  [
    "distribution hub for clients and installers",
    {
      icon: Boxes,
      en: [
        "Use the distribution service to assemble an equipment list for a project or find a matching replacement. Model numbers, quantities and connector types help narrow the selection.",
        "Bring a parts list and the models already on site. Ask about compatibility, current availability and collection or delivery options.",
      ],
      he: [
        "שירות ההפצה מתאים לריכוז ציוד לפרויקט או למציאת רכיב חלופי. דגמים, כמויות וסוגי חיבורים עוזרים לדייק את רשימת הפריטים.",
        "הכינו רשימת ציוד ודגמים שכבר מותקנים בשטח. אפשר לברר התאמה, זמינות ואפשרויות איסוף או משלוח.",
      ],
    },
  ],
  [
    "installer and customer support helpdesk",
    {
      icon: Headphones,
      en: [
        "The helpdesk is a starting point for setup questions and faults in installed equipment. A clear description of the symptom helps distinguish a configuration issue from a connection or hardware problem.",
        "Have the model and any error message ready. Describe when the issue started and what changed. Leave passwords out of the enquiry.",
      ],
      he: [
        "מוקד התמיכה מיועד לשאלות הגדרה ולתקלות בציוד מותקן. תיאור מדויק של התסמין עוזר להבחין בין בעיית הגדרה, חיבור או רכיב.",
        "הכינו את דגם הציוד והודעת השגיאה. תארו מתי התחילה התקלה ומה השתנה, בלי לכלול סיסמאות בפנייה.",
      ],
    },
  ],
  [
    "fire alarm system installation",
    {
      icon: Siren,
      en: [
        "Fire detection planning considers the building layout, detector locations, control panel and how occupants receive a warning. An assessment establishes the installation and testing scope for the site.",
        "Describe the building use and floors. Have the existing system details and any project requirements ready for review.",
      ],
      he: [
        "תכנון מערכת גילוי אש מתייחס למבנה, למיקום הגלאים, לרכזת ולאופן שבו מתקבלת התרעה. בדיקת האתר מאפשרת להגדיר את היקף ההתקנה והבדיקות.",
        "ציינו את השימוש במבנה ואת מספר הקומות. הכינו פרטים על המערכת הקיימת ועל דרישות שכבר הוגדרו לפרויקט.",
      ],
    },
  ],
  [
    "ev charging station installation",
    {
      icon: Unplug,
      en: [
        "Planning a charging point starts with the parking space, the vehicle and the available electrical supply. A site assessment determines the cable route and suitable charging equipment.",
        "Note the vehicle model, parking arrangement and approximate distance to the electrical panel. A qualified electrician can assess capacity on site.",
      ],
      he: [
        "תכנון עמדת טעינה מתחיל במיקום החניה, בסוג הרכב ובתשתית החשמל הזמינה. בדיקה באתר מאפשרת לקבוע תוואי לכבל ולהתאים את העמדה.",
        "ציינו את דגם הרכב, סוג החניה והמרחק המשוער מלוח החשמל. את התאמת התשתית בודקים בשטח עם חשמלאי מוסמך.",
      ],
    },
  ],
  [
    "custom pc and server assembly",
    {
      icon: Cpu,
      en: [
        "A custom build starts with the applications it will run. Processor, memory, storage, cooling and future expansion are selected together for a workstation or server.",
        "List the software, expected users, storage needs and any existing components you hope to reuse.",
      ],
      he: [
        "הרכבת מחשב או שרת מתחילה בתוכנות שיעבדו עליו. המעבד, הזיכרון, האחסון והקירור נבחרים יחד, עם מקום להרחבה בהמשך.",
        "הכינו רשימת תוכנות, מספר משתמשים צפוי, צורכי אחסון ורכיבים קיימים שתרצו לשלב.",
      ],
    },
  ],
  [
    "mobile and computer repair lab",
    {
      icon: MonitorSmartphone,
      en: [
        "Diagnostics help identify whether a fault involves the display, battery, storage, software or another component. The diagnosis informs the repair options and parts required.",
        "Include the make, model and symptoms. Mention any drop or liquid exposure and ask about backup options before handing over the device.",
      ],
      he: [
        "אבחון במעבדה עוזר לאתר אם מקור התקלה במסך, בסוללה, באחסון, בתוכנה או ברכיב אחר. לפי הממצאים אפשר לבחון אפשרויות תיקון וחלקים דרושים.",
        "ציינו יצרן, דגם ותסמינים, כולל נפילה או מגע עם נוזל. לפני מסירת המכשיר בררו מהן אפשרויות הגיבוי.",
      ],
    },
  ],
  [
    "event camera rental",
    {
      icon: Camera,
      en: [
        "Temporary security cameras can cover event entrances, equipment areas and other agreed locations. Placement depends on the venue, power, network access and whether live viewing or recording is needed.",
        "Share the event dates, venue layout, setup window and viewing requirements. Confirm who will operate the equipment and collect it afterwards.",
      ],
      he: [
        "מצלמות אבטחה זמניות יכולות לכסות כניסות, אזורי ציוד ונקודות נוספות באירוע. המיקום תלוי בתנאי השטח, בחשמל, בתקשורת ובצורך בצפייה חיה או בהקלטה.",
        "ציינו תאריכים, מבנה האתר, זמן ההקמה וצורכי הצפייה. תאמו מראש מי יפעיל את הציוד ומתי ייאסף.",
      ],
    },
  ],
  [
    "business recording cloud storage",
    {
      icon: Cloud,
      en: [
        "Off-site storage keeps a remote copy of recordings from compatible systems. Camera count, recording quality, upload capacity and retention period determine how much storage is needed.",
        "Bring the recorder model, number of cameras and desired retention period. Identify who needs permission to retrieve recordings.",
      ],
      he: [
        "אחסון מרוחק מאפשר לשמור עותק של הקלטות ממערכות תואמות. מספר המצלמות, איכות הווידאו, קצב ההעלאה ומשך השמירה קובעים את נפח האחסון הדרוש.",
        "הכינו את דגם המקליט, מספר המצלמות ומשך השמירה המבוקש. הגדירו למי נדרשת הרשאה לאחזר הקלטות.",
      ],
    },
  ],
  [
    "business website development",
    {
      icon: PanelsTopLeft,
      en: [
        "Website planning starts with what a visitor needs to do, such as review services, browse products or send an enquiry. That choice shapes the pages, navigation, content and mobile layout.",
        "List your audience, languages and main visitor actions. Gather your logo, existing content and examples of pages you need.",
      ],
      he: [
        "תכנון אתר עסקי מתחיל בפעולה הרצויה של המבקר, למשל עיון בשירותים, צפייה במוצרים או שליחת פנייה. מכאן נגזרים העמודים, הניווט, התוכן והתצוגה בנייד.",
        "ציינו קהל יעד, שפות ופעולות חשובות. רכזו לוגו, תכנים קיימים ודוגמאות לעמודים הדרושים לכם.",
      ],
    },
  ],
]);

export function serviceGuide(service: PublishedService) {
  const guide =
    guides.get(service.slug) ??
    guides.get(service.name_en.trim().toLowerCase());
  return { guide, Icon: guide?.icon ?? Wrench };
}
