const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", EUR: "€" };

/** "2026-01-15T10:06:59Z" or "2026-01-15" -> "15 Jan 2026" */
export function formatDate(iso: string): string {
  const [datePart] = iso.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** "2026-01-15..." -> "2026-01" */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function formatAmount(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const value = Math.abs(amount).toFixed(2);
  const sign = amount < 0 ? "-" : "";
  return symbol ? `${sign}${symbol}${value}` : `${sign}${value} ${currency}`;
}

/** Renders a per-currency amounts map without ever summing across currencies, e.g. "$12.34" or "$12.34 / €1.00". */
export function formatCurrencyAmounts(amounts: Record<string, number>): string {
  const entries = Object.entries(amounts);
  if (entries.length === 0) return formatAmount(0, "USD");
  return entries.map(([currency, amount]) => formatAmount(amount, currency)).join(" / ");
}
