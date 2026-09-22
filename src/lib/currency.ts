/** Currency display for farm figures (Farm Settings → Currency).
 *
 * Intl's `style: "currency"` formatter falls back to printing the bare ISO
 * code (e.g. "JMD 1,234") whenever the runtime's ICU data has no localized
 * symbol for that currency — which is exactly what was happening for JMD.
 * Hand-rolling a small symbol table sidesteps that entirely and lets every
 * currency the farm can choose (Settings page) render the short form
 * people actually use, e.g. "J$" for Jamaican dollars. */

export type CurrencyCode = "USD" | "JMD" | "CAD" | "GBP";

const SYMBOL: Record<CurrencyCode, string> = {
  USD: "$",
  JMD: "J$",
  CAD: "CA$",
  GBP: "£",
};

/** Regional-indicator flag emoji for the country each currency belongs to. */
const FLAG: Record<CurrencyCode, string> = {
  USD: "🇺🇸",
  JMD: "🇯🇲",
  CAD: "🇨🇦",
  GBP: "🇬🇧",
};

function isCurrencyCode(v: string): v is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(SYMBOL, v);
}

/** "$" / "J$" / "CA$" / "£" — falls back to the raw code for anything not
 * in the table above, so a future currency never renders as nothing. */
export function currencySymbol(currency: string): string {
  return isCurrencyCode(currency) ? SYMBOL[currency] : `${currency} `;
}

/** Country flag for the farm's chosen currency, or "" if unrecognized. */
export function currencyFlag(currency: string): string {
  return isCurrencyCode(currency) ? FLAG[currency] : "";
}

/** Full-precision whole-currency figure, e.g. "J$1,234,567" — for table
 * rows, line items, and anywhere the exact amount matters. */
export function fmtMoney(n: number, currency: string): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}${currencySymbol(currency)}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Compact figure for tight spaces (a donut chart's centered total, a
 * sparkline's end label) — abbreviates to K/M and trims decimals as the
 * number grows, e.g. "J$850" → "J$12.3K" → "J$1.2M" → "J$12M". */
export function fmtMoneyCompact(n: number, currency: string): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const sym = currencySymbol(currency);
  if (abs >= 1_000_000) {
    return `${sign}${sym}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${sym}${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  }
  return `${sign}${sym}${abs.toFixed(0)}`;
}
