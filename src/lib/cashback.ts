import type { CurrencyAmounts } from "./fx";
import { monthKey } from "./format";
import { isSpendCountable } from "./spending";
import type { Provider, Transaction } from "./schema";

export type { CurrencyAmounts };

function addAmount(bucket: CurrencyAmounts, currency: string, amount: number) {
  bucket[currency] = (bucket[currency] ?? 0) + amount;
}

/**
 * The cashback actually earned by one transaction, if any — real recorded
 * values only, never estimated, and only *actual card cashback*:
 *  - EtherFi: a positive `cashbackEarned` on a `type === "spend"` card row
 *    (its own column). EtherFi's "cashback_claim" row type happens to
 *    populate that same column with its claim amount, but a claim payout
 *    is not card cashback — deliberately excluded here, even though the
 *    raw value is still preserved on that transaction.
 *  - Plasma: a `type === "cashback"` row (its own transaction; identified
 *    directly by Plasma's "Card cashback" type, not inferred).
 * Distinct from refunds, funding, and the non-card reward/financial-operation
 * types (affiliate rewards, borrow cashback, claims, etc.) — none of those count.
 */
export function cashbackEarnedOf(t: Transaction): { amount: number; currency: string } | null {
  if (t.provider === "etherfi") {
    if (t.type !== "spend") return null;
    if (t.cashbackEarned === undefined || t.cashbackEarned <= 0) return null;
    return { amount: t.cashbackEarned, currency: t.cashbackCurrency ?? t.currency };
  }
  if (t.type === "cashback") {
    const amount = -t.amount; // stored as money-in (negative); earned is positive
    if (amount <= 0) return null;
    return { amount, currency: t.currency };
  }
  return null;
}

export function totalCashback(transactions: Transaction[]): CurrencyAmounts {
  const totals: CurrencyAmounts = {};
  for (const t of transactions) {
    const cb = cashbackEarnedOf(t);
    if (cb) addAmount(totals, cb.currency, cb.amount);
  }
  return totals;
}

export function cashbackByProvider(transactions: Transaction[]): Record<Provider, CurrencyAmounts> {
  const result = {} as Record<Provider, CurrencyAmounts>;
  for (const t of transactions) {
    const cb = cashbackEarnedOf(t);
    if (!cb) continue;
    result[t.provider] ??= {};
    addAmount(result[t.provider], cb.currency, cb.amount);
  }
  return result;
}

export interface MonthlyCashback {
  month: string; // "YYYY-MM"
  amounts: CurrencyAmounts;
}

export function cashbackByMonth(transactions: Transaction[]): MonthlyCashback[] {
  const byMonth = new Map<string, CurrencyAmounts>();
  for (const t of transactions) {
    const cb = cashbackEarnedOf(t);
    if (!cb) continue;
    const month = monthKey(t.date);
    if (!byMonth.has(month)) byMonth.set(month, {});
    addAmount(byMonth.get(month)!, cb.currency, cb.amount);
  }
  return [...byMonth.entries()]
    .map(([month, amounts]) => ({ month, amounts }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Effective cashback rate = cashback earned / spending × 100, computed
 * separately per currency so amounts are never mixed across currencies.
 * Spending here follows the same definition as spending.ts (spend + refund
 * only — funding/transfer/cashback excluded).
 */
export function cashbackRate(transactions: Transaction[]): CurrencyAmounts {
  const earned = totalCashback(transactions);
  const spend: CurrencyAmounts = {};
  for (const t of transactions.filter(isSpendCountable)) {
    addAmount(spend, t.currency, t.amount);
  }

  const rate: CurrencyAmounts = {};
  for (const currency of Object.keys(earned)) {
    const spentInCurrency = spend[currency];
    if (spentInCurrency) rate[currency] = (earned[currency] / spentInCurrency) * 100;
  }
  return rate;
}
