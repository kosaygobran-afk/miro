export function hasSupabasePublicConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function authUnavailableMessage(locale: "he" | "en") {
  if (hasSupabasePublicConfig()) {
    return locale === "he"
      ? "האימות עדיין לא חובר לקוד השרת בשלב 1, ולכן הטופס לא מתחבר לחשבון אמיתי."
      : "Authentication is not wired to the server code in Phase 1, so this form cannot sign in to a real account yet.";
  }

  return locale === "he"
    ? "חסרים פרטי Supabase בסביבת הפיתוח. עמודים ציבוריים ממשיכים לעבוד, אבל כניסה והרשמה חסומות."
    : "Supabase credentials are missing in this development setup. Public pages still work, but sign-in and signup are blocked.";
}
