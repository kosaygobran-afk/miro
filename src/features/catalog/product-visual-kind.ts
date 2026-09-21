export type ProductVisualKind =
  | "bullet"
  | "dome"
  | "intercom"
  | "alarm"
  | "router"
  | "switch"
  | "cable"
  | "lock";

export function getProductVisualKind(product: {
  id: string;
  name: string;
  category: string;
  icon?: string;
}): ProductVisualKind {
  const text =
    `${product.id} ${product.name} ${product.category} ${product.icon ?? ""}`.toLowerCase();
  if (/doorbell|intercom|אינטרקום|פעמון/.test(text)) return "intercom";
  if (/lock|מנעול|key/.test(text)) return "lock";
  if (/alarm|siren|אזעקה|sensor|גלאי/.test(text)) return "alarm";
  if (/bullet|צינור|ptz/.test(text)) return "bullet";
  if (/camera|מצלמ/.test(text)) return "dome";
  if (/cable|כבל|connector|מחבר/.test(text)) return "cable";
  if (/wifi|wi-fi|router|נתב|גישה|mesh/.test(text)) return "router";
  return "switch";
}
