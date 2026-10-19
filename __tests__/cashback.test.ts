import { describe, expect, it } from "vitest";
import { cashbackByMonth, cashbackByProvider, cashbackEarnedOf, cashbackRate, totalCashback } from "../src/lib/cashback";
import type { Transaction } from "../src/lib/schema";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: "etherfi:1",
    date: "2026-01-15",
    provider: "etherfi",
    merchant: "Market",
    amount: 10,
    currency: "USD",
    type: "spend",
    category: "uncategorized",
    sourceId: "1",
    needsReview: false,
    raw: {},
    ...overrides,
  };
}

describe("cashbackEarnedOf", () => {
  it("reads EtherFi's per-row cashbackEarned field", () => {
    const t = tx({ provider: "etherfi", cashbackEarned: 0.35, cashbackCurrency: "USD" });
    expect(cashbackEarnedOf(t)).toEqual({ amount: 0.35, currency: "USD" });
  });

  it("ignores an EtherFi row with no cashback earned", () => {
    expect(cashbackEarnedOf(tx({ provider: "etherfi" }))).toBeNull();
  });

  it("reads a Plasma type=cashback row, flipping sign to a positive 'earned' amount", () => {
    const t = tx({ provider: "plasma", type: "cashback", amount: -8.33, currency: "USD" });
    expect(cashbackEarnedOf(t)).toEqual({ amount: 8.33, currency: "USD" });
  });


  it("never estimates — a Plasma spend row has no cashback even if EtherFi-style fields are absent", () => {
    expect(cashbackEarnedOf(tx({ provider: "plasma", type: "spend" }))).toBeNull();
  });

  it("does not confuse cashback with refunds or funding", () => {
    expect(cashbackEarnedOf(tx({ provider: "plasma", type: "refund", amount: -10 }))).toBeNull();
    expect(cashbackEarnedOf(tx({ provider: "plasma", type: "funding", amount: -500 }))).toBeNull();
  });

  it("excludes EtherFi's cashback_claim even though it populates the same cashbackEarned column", () => {
    // Real case: a "cashback_claim" row's "cashback earned" column holds the
    // claim amount itself. Only actual card cashback (on a spend row) counts.
    const claim = tx({ provider: "etherfi", type: "cashback_claim", cashbackEarned: 53.64, cashbackCurrency: "USD" });
    expect(cashbackEarnedOf(claim)).toBeNull();
  });

  it("excludes the other non-card EtherFi types too", () => {
    for (const type of ["financial_operation", "reward", "reward_payout", "borrowing_reward"] as const) {
      expect(cashbackEarnedOf(tx({ provider: "etherfi", type, cashbackEarned: 1, cashbackCurrency: "USD" }))).toBeNull();
    }
  });
});

describe("totalCashback / cashbackByProvider", () => {
  const transactions = [
    tx({ id: "etherfi:1", provider: "etherfi", cashbackEarned: 0.35, cashbackCurrency: "USD" }),
    tx({ id: "etherfi:2", provider: "etherfi", cashbackEarned: 0.15, cashbackCurrency: "USD" }),
    tx({ id: "plasma:1", provider: "plasma", type: "cashback", amount: -8.33, currency: "USD" }),
    tx({ id: "plasma:2", provider: "plasma", type: "spend", amount: 20 }), // no cashback
  ];

  it("sums per currency across both providers' cashback mechanisms", () => {
    expect(totalCashback(transactions)).toEqual({ USD: 0.35 + 0.15 + 8.33 });
  });

  it("breaks totals down by provider", () => {
    expect(cashbackByProvider(transactions)).toEqual({
      etherfi: { USD: 0.5 },
      plasma: { USD: 8.33 },
    });
  });

  it("keeps different currencies separate instead of summing them", () => {
    const mixed = [
      tx({ id: "etherfi:1", cashbackEarned: 1, cashbackCurrency: "USD" }),
      tx({ id: "etherfi:2", cashbackEarned: 2, cashbackCurrency: "EUR" }),
    ];
    expect(totalCashback(mixed)).toEqual({ USD: 1, EUR: 2 });
  });
});

describe("cashbackByMonth", () => {
  it("aggregates earned cashback by month, per currency", () => {
    const transactions = [
      tx({ id: "etherfi:1", date: "2026-01-10", cashbackEarned: 0.5, cashbackCurrency: "USD" }),
      tx({ id: "etherfi:2", date: "2026-01-20", cashbackEarned: 0.25, cashbackCurrency: "USD" }),
      tx({ id: "etherfi:3", date: "2026-02-05", cashbackEarned: 1, cashbackCurrency: "USD" }),
    ];
    expect(cashbackByMonth(transactions)).toEqual([
      { month: "2026-01", amounts: { USD: 0.75 } },
      { month: "2026-02", amounts: { USD: 1 } },
    ]);
  });
});

describe("cashbackRate", () => {
  it("computes earned / spend * 100 per currency", () => {
    const transactions = [
      tx({ id: "etherfi:1", type: "spend", amount: 100, currency: "USD", cashbackEarned: undefined }),
      tx({ id: "etherfi:2", type: "spend", amount: 100, currency: "USD", cashbackEarned: 5, cashbackCurrency: "USD" }),
    ];
    expect(cashbackRate(transactions)).toEqual({ USD: 2.5 }); // 5 earned / 200 spent * 100
  });

  it("excludes funding/transfer/cashback from the spend denominator", () => {
    const transactions = [
      tx({ id: "etherfi:1", type: "spend", amount: 100, currency: "USD" }),
      tx({ id: "plasma:1", provider: "plasma", type: "funding", amount: -500, currency: "USD" }),
      tx({ id: "plasma:2", provider: "plasma", type: "cashback", amount: -10, currency: "USD" }),
    ];
    // earned = 10 (the plasma cashback), spend = 100 (only the etherfi spend row)
    expect(cashbackRate(transactions)).toEqual({ USD: 10 });
  });

  it("returns no rate for a currency with cashback but no spend to divide by", () => {
    const transactions = [tx({ id: "etherfi:1", type: "cashback", provider: "plasma", amount: -5, currency: "EUR" })];
    expect(cashbackRate(transactions)).toEqual({});
  });
});
