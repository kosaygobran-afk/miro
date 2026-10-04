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
  backspace: { he: "הצגת שמאלה", en: "Backspace" },
  clear: { he: "נקוי", en: "Clear" },
  percent: { he: "%", en: "%" },
  divide: { he: "חילוק", en: "Divide" },
  multiply: { he: "כפל", en: "Multiply" },
  subtract: { he: "חיסור", en: "Subtract" },
  add: { he: "חיבור", en: "Add" },
  equals: { he: "שווה ל", en: "Equals" },
  decimal: { he: "נקודה עשרונית", en: "Decimal" },
  sign: { he: "שינוי סימן", en: "Sign" },

  // VAT buttons
  vatAdd: { he: "+מע\"מ", en: "+VAT" },
  vatSubtract: { he: "-מע\"מ", en: "-VAT" },

  // History
  history: { he: "היסטוריה", en: "History" },
  clearHistory: { he: "נקוי היסטוריה", en: "Clear History" },
  clearHistoryConfirm: {
    he: "האם אתה בטוח שברצונך לנקות את כל ההיסטוריה?",
    en: "Are you sure you want to clear all history?",
  },
  noHistory: { he: "אין היסטוריה להצגה", en: "No history to display" },

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