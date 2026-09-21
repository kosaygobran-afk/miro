import {
  Camera,
  KeyRound,
  LockKeyhole,
  Router,
  type LucideIcon,
} from "lucide-react";

export const serviceIcons: Record<string, LucideIcon> = {
  "security-cameras": Camera,
  "alarm-systems": LockKeyhole,
  "intercom-access": KeyRound,
  "network-wifi": Router,
};

export const processSteps = {
  en: [
    "Enquiry",
    "Site assessment",
    "Clear proposal",
    "Installation and support",
  ],
  he: ["פנייה", "בדיקת שטח", "הצעה ברורה", "התקנה ותמיכה"],
};

export const faqs = {
  en: [
    [
      "Are prices final?",
      "No. Prices and packages must be confirmed by the owner before launch.",
    ],
    [
      "Can I sign in?",
      "Not yet. Phase 1 blocks authentication honestly until Supabase auth is implemented.",
    ],
    [
      "Is the store live?",
      "No. Store item cards are development previews only.",
    ],
  ],
  he: [
    ["המחירים סופיים?", "לא. מחירים וחבילות חייבים אישור בעלים לפני השקה."],
    ["אפשר להתחבר?", "עדיין לא. שלב 1 חוסם אימות בצורה כנה עד יישום Supabase."],
    ["החנות פעילה?", "לא. כרטיסי הפריטים הם תצוגת פיתוח בלבד."],
  ],
};
