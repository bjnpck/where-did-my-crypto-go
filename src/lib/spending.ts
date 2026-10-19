import { displayCategory } from "./categories";
import { monthKey } from "./format";
import { sumToUsd, type CurrencyAmounts, type FxRate } from "./fx";
import type { Provider, Transaction } from "./schema";

// Only "spend" and "refund" count toward spending totals. Funding, transfers,
// cashback, and anything still "unknown" are excluded per the spec. Refunds
// reduce spending by relying on the same amount sign convention used
// everywhere else (positive = out, negative = in): summing spend + refund
// amounts naturally nets them out.
const SPEND_TYPES: Transaction["type"][] = ["spend", "refund"];

export function isSpendCountable(t: Transaction): boolean {
  return SPEND_TYPES.includes(t.type);
}

// Non-card account activity some providers report alongside card
// transactions (DeFi lending/yield, cross-chain bridging, referral
// programs). Hidden from the default view — only shown under "all
// activity" — and never counted toward spending or cashback.
const NON_CARD_TYPES: Transaction["type"][] = [
  "financial_operation",
  "cashback_claim",
  "reward",
  "reward_payout",
  "borrowing_reward",
];

export function isCardActivity(t: Transaction): boolean {
  return !NON_CARD_TYPES.includes(t.type);
}

export interface Filters {
  month?: string; // "YYYY-MM"
  provider?: Provider;
  category?: string; // simplified display category
}

export function filterTransactions(transactions: Transaction[], filters: Filters): Transaction[] {
  return transactions.filter((t) => {
    if (filters.month && monthKey(t.date) !== filters.month) return false;
    if (filters.provider && t.provider !== filters.provider) return false;
    if (filters.category && displayCategory(t) !== filters.category) return false;
    return true;
  });
}

export interface Summary {
  total: number; // USD
  count: number;
  byProvider: Record<string, number>; // USD
  // Spend in a currency that couldn't be converted to USD (no FX rate
  // available) — excluded from `total`/`byProvider` rather than guessed.
  unconverted: CurrencyAmounts;
}

export function summarize(transactions: Transaction[], fx: FxRate | null = null): Summary {
  const spendable = transactions.filter(isSpendCountable);
  const byCurrency: CurrencyAmounts = {};
  const byProviderCurrency: Partial<Record<Provider, CurrencyAmounts>> = {};
  for (const t of spendable) {
    byCurrency[t.currency] = (byCurrency[t.currency] ?? 0) + t.amount;
    const perProvider = (byProviderCurrency[t.provider] ??= {});
    perProvider[t.currency] = (perProvider[t.currency] ?? 0) + t.amount;
  }

  const { usd: total, unconverted } = sumToUsd(byCurrency, fx);
  const byProvider: Record<string, number> = {};
  for (const [provider, amounts] of Object.entries(byProviderCurrency)) {
    byProvider[provider] = sumToUsd(amounts, fx).usd;
  }

  return { total, count: spendable.length, byProvider, unconverted };
}

export interface BreakdownEntry {
  key: string;
  total: number; // USD
}

export function monthlyTrend(transactions: Transaction[], fx: FxRate | null = null): BreakdownEntry[] {
  const byKey = new Map<string, CurrencyAmounts>();
  for (const t of transactions.filter(isSpendCountable)) {
    const key = monthKey(t.date);
    const amounts = byKey.get(key) ?? {};
    amounts[t.currency] = (amounts[t.currency] ?? 0) + t.amount;
    byKey.set(key, amounts);
  }
  return [...byKey.entries()]
    .map(([key, amounts]) => ({ key, total: sumToUsd(amounts, fx).usd }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function categoryBreakdown(transactions: Transaction[], fx: FxRate | null = null): BreakdownEntry[] {
  const byKey = new Map<string, CurrencyAmounts>();
  for (const t of transactions.filter(isSpendCountable)) {
    const key = displayCategory(t);
    const amounts = byKey.get(key) ?? {};
    amounts[t.currency] = (amounts[t.currency] ?? 0) + t.amount;
    byKey.set(key, amounts);
  }
  return [...byKey.entries()]
    .map(([key, amounts]) => ({ key, total: sumToUsd(amounts, fx).usd }))
    .sort((a, b) => b.total - a.total);
}
