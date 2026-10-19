import { describe, expect, it } from "vitest";
import { categoryBreakdown, filterTransactions, isCardActivity, monthlyTrend, summarize } from "../src/lib/spending";
import type { FxRate } from "../src/lib/fx";
import type { Transaction } from "../src/lib/schema";

const fx: FxRate = { rate: 1.1, date: "2026-10-16", fetchedAt: 0 };

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: `etherfi:${Math.random()}`,
    date: "2026-01-15",
    provider: "etherfi",
    merchant: "Market",
    amount: 10,
    currency: "USD",
    type: "spend",
    category: "5411 - Grocery Stores and Supermarkets",
    sourceId: "1",
    needsReview: false,
    raw: {},
    ...overrides,
  };
}

describe("summarize", () => {
  it("sums only spend and refund types, excludes funding/transfer/unknown", () => {
    const transactions = [
      tx({ type: "spend", amount: 50, provider: "etherfi" }),
      tx({ type: "refund", amount: -20, provider: "etherfi" }),
      tx({ type: "funding", amount: -500, provider: "plasma" }),
      tx({ type: "transfer", amount: 50, provider: "plasma" }),
      tx({ type: "unknown", amount: -8.33, provider: "plasma" }), // cashback
    ];

    const summary = summarize(transactions);
    expect(summary.count).toBe(2);
    expect(summary.total).toBeCloseTo(30); // 50 - 20
    expect(summary.byProvider).toEqual({ etherfi: 30 });
  });

  it("returns zeroes for an empty list", () => {
    expect(summarize([])).toEqual({ total: 0, count: 0, byProvider: {}, unconverted: {} });
  });

  it("converts EUR (Gnosis) spend into USD using the given rate, combined with USD spend", () => {
    const transactions = [
      tx({ type: "spend", amount: 50, provider: "etherfi", currency: "USD" }),
      tx({ type: "spend", amount: 10, provider: "gnosis", currency: "EUR" }),
    ];
    const summary = summarize(transactions, fx);
    expect(summary.total).toBeCloseTo(61); // 50 + 10*1.1
    expect(summary.byProvider).toEqual({ etherfi: 50, gnosis: 11 });
    expect(summary.unconverted).toEqual({});
  });

  it("keeps EUR spend out of the USD total (not combined, not dropped) when no rate is available", () => {
    const transactions = [
      tx({ type: "spend", amount: 50, provider: "etherfi", currency: "USD" }),
      tx({ type: "spend", amount: 10, provider: "gnosis", currency: "EUR" }),
    ];
    const summary = summarize(transactions, null);
    expect(summary.total).toBe(50);
    expect(summary.unconverted).toEqual({ EUR: 10 });
  });
});

describe("filterTransactions", () => {
  const transactions = [
    tx({ date: "2026-01-10", provider: "etherfi", category: "5411 - Grocery Stores" }),
    tx({ date: "2026-02-10", provider: "plasma", category: "5812 - Eating Places" }),
  ];

  it("filters by month", () => {
    expect(filterTransactions(transactions, { month: "2026-01" })).toHaveLength(1);
  });

  it("filters by provider", () => {
    expect(filterTransactions(transactions, { provider: "plasma" })).toHaveLength(1);
  });

  it("filters by simplified display category", () => {
    expect(filterTransactions(transactions, { category: "Restaurants" })).toHaveLength(1);
  });

  it("combines filters with AND semantics", () => {
    expect(filterTransactions(transactions, { provider: "plasma", month: "2026-01" })).toHaveLength(0);
  });

  it("respects a category override when filtering", () => {
    const withOverride = [tx({ category: "5411 - Grocery Stores", categoryOverride: "Shopping" })];
    expect(filterTransactions(withOverride, { category: "Shopping" })).toHaveLength(1);
    expect(filterTransactions(withOverride, { category: "Groceries" })).toHaveLength(0);
  });
});

describe("monthlyTrend", () => {
  it("aggregates spend by month, sorted ascending, excluding non-spend types", () => {
    const transactions = [
      tx({ date: "2026-02-01", amount: 10 }),
      tx({ date: "2026-01-01", amount: 20 }),
      tx({ date: "2026-01-15", amount: 5 }),
      tx({ date: "2026-01-20", amount: -500, type: "funding" }),
    ];
    expect(monthlyTrend(transactions)).toEqual([
      { key: "2026-01", total: 25 },
      { key: "2026-02", total: 10 },
    ]);
  });

  it("converts EUR spend into the same month's USD total when a rate is given", () => {
    const transactions = [
      tx({ date: "2026-01-01", amount: 20, provider: "etherfi", currency: "USD" }),
      tx({ date: "2026-01-15", amount: 10, provider: "gnosis", currency: "EUR" }),
    ];
    expect(monthlyTrend(transactions, fx)).toEqual([{ key: "2026-01", total: 31 }]); // 20 + 10*1.1
  });
});

describe("isCardActivity", () => {
  it("treats actual card-related types as card activity", () => {
    for (const type of ["spend", "refund", "funding", "transfer", "cashback", "unknown"] as const) {
      expect(isCardActivity(tx({ type }))).toBe(true);
    }
  });

  it("excludes non-card account activity (DeFi/referral operations)", () => {
    for (const type of ["financial_operation", "cashback_claim", "reward", "reward_payout", "borrowing_reward"] as const) {
      expect(isCardActivity(tx({ type }))).toBe(false);
    }
  });
});

describe("categoryBreakdown", () => {
  it("aggregates spend by display category, sorted by total descending", () => {
    const transactions = [
      tx({ category: "5411 - Grocery Stores", amount: 10 }),
      tx({ category: "5812 - Eating Places", amount: 30 }),
      tx({ category: "5812 - Eating Places", amount: 5 }),
    ];
    expect(categoryBreakdown(transactions)).toEqual([
      { key: "Restaurants", total: 35 },
      { key: "Groceries", total: 10 },
    ]);
  });
});
