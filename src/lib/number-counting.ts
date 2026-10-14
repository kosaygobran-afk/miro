/** Only one ordinary decimal metric is eligible; dates, ratios and IDs stay literal. */
export function parseCountableNumber(text: string) {
  const match = text.match(
    /^([\s\u200e\u200f\u061c₪$€£]*)([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)([\s\u200e\u200f\u061c%₪$€£+]*?)$/,
  );
  if (!match) return null;
  const [, prefix, numeric, suffix] = match;
  const unsigned = numeric.replace(/^[+-]/, "");
  // Leading zeroes usually denote an identifier, rather than a measured value.
  if (/^0\d/.test(unsigned)) return null;
  const value = Number(numeric.replaceAll(",", ""));
  const precision = unsigned.split(".")[1]?.length ?? 0;
  if (
    !Number.isFinite(value) ||
    Math.abs(value) > Number.MAX_SAFE_INTEGER ||
    precision > 6
  )
    return null;
  const formatter = new Intl.NumberFormat("en-US", {
    useGrouping: numeric.includes(","),
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
    signDisplay: numeric.startsWith("+") ? "always" : "auto",
  });
  return {
    value,
    format: (progress: number) => {
      if (progress >= 1) return text;
      const eased = 1 - Math.pow(1 - Math.max(0, progress), 3);
      const current =
        precision === 0 ? Math.trunc(value * eased) : value * eased;
      return `${prefix}${formatter.format(current)}${suffix}`;
    },
  };
}
