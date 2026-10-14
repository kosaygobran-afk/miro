type LocaleCode = "he" | "en";
type CopyMap = Record<string, Record<LocaleCode, string>>;

export const calculatorCopy = {
  // Title and basic actions
  title: { he: "מחשבון", en: "Calculator" },
  open: { he: "פתיחת מחשבון", en: "Open calculator" },
  close: { he: "סגירת מחשבון", en: "Close calculator" },
  minimize: { he: "צמצום מחשבון", en: "Minimize calculator" },
  restore: { he: "שחזור מחשבון", en: "Restore calculator" },
  drag: { he: "גרירת חלון המחשבון", en: "Drag calculator window" },

  // Keypad buttons
  backspace: { he: "מחיקה", en: "Backspace" },
  clear: { he: "ניקוי", en: "Clear" },
  percent: { he: "%", en: "%" },
  divide: { he: "חילוק", en: "Divide" },
  multiply: { he: "כפל", en: "Multiply" },
  subtract: { he: "חיסור", en: "Subtract" },
  add: { he: "חיבור", en: "Add" },
  equals: { he: "שווה ל", en: "Equals" },
  decimal: { he: "נקודה עשרונית", en: "Decimal" },
  sign: { he: "שינוי סימן", en: "Sign" },

  // VAT buttons
  vatAdd: { he: '+מע"מ', en: "+VAT" },
  vatSubtract: { he: '-מע"מ', en: "-VAT" },
  vatRateLabel: { he: 'מע"מ', en: "VAT" },
  vatUnavailable: { he: 'שיעור המע"מ אינו זמין', en: "VAT rate unavailable" },

  // History
  history: { he: "היסטוריה", en: "History" },
  clearHistory: { he: "נקוי היסטוריה", en: "Clear History" },
  clearHistoryConfirm: {
    he: "האם אתה בטוח שברצונך לנקות את כל ההיסטוריה?",
    en: "Are you sure you want to clear all history?",
  },
  noHistory: { he: "אין היסטוריה להצגה", en: "No history to display" },
  historyLoading: { he: "טוען היסטוריה…", en: "Loading history…" },
  historyUnavailable: {
    he: "ההיסטוריה אינה זמינה כרגע",
    en: "History is unavailable right now",
  },
  retryHistory: { he: "ניסיון חוזר", en: "Retry" },
  historySaveFailed: {
    he: "התוצאה נשמרה במסך, אך לא ניתן לשמור אותה בהיסטוריה",
    en: "The result is available, but it could not be saved to history",
  },
  historyClearFailed: {
    he: "לא ניתן לנקות את ההיסטוריה. הנתונים נשארו ללא שינוי",
    en: "History could not be cleared. Existing entries were kept",
  },

  // Error messages
  errorEmptyInput: { he: "קלט ריק", en: "Empty input" },
  errorDivByZero: { he: "חילוק באפס", en: "Division by zero" },
  errorOverflow: { he: "זרימה מעבר", en: "Overflow" },
  errorInvalidExpression: { he: "ביטוי לא תקין", en: "Invalid expression" },
  errorTooManyOperations: { he: "יותר מדי פעולות", en: "Too many operations" },
  errorInputTooLong: { he: "קלט ארוך מדי", en: "Input too long" },
  errorNonFiniteResult: { he: "תוצאה איננה סופית", en: "Non-finite result" },

  // Note about percent semantics
  percentNote: {
    he: "הערה: אחוזים פועלים לפי כללי מחשבון רגיל (לדוגמה: 1000 + 18% = 1180)",
    en: "Note: Percentages work in standard calculator fashion (e.g.: 1000 + 18% = 1180)",
  },
} satisfies CopyMap;
