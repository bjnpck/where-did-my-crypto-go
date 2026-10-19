import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyCategoryToMerchant,
  clearAllData,
  clearAllTransactions,
  getAllMerchantRules,
  getAllTransactions,
  importTransactions,
  markReviewed,
  patchTransaction,
  setTransactionCategory,
} from "../src/lib/db";
import { etherfiParser } from "../src/lib/parsers/etherfi";
import { gnosisParser } from "../src/lib/parsers/gnosis";
import { plasmaParser } from "../src/lib/parsers/plasma";
import type { Transaction } from "../src/lib/schema";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "etherfi:1",
    date: "2026-01-15",
    provider: "etherfi",
    merchant: "Coffee Shop",
    amount: 4.5,
    currency: "USD",
    type: "spend",
    category: "uncategorized",
    sourceId: "1",
    needsReview: false,
    // A raw row consistent with the default fields above, so getAllTransactions()'s
    // reclassify-on-read doesn't treat this fixture as stale and rewrite it.
    raw: { type: "card_spend" },
    ...overrides,
  };
}

describe("importTransactions", () => {
  beforeEach(async () => {
    await clearAllTransactions();
  });

  it("inserts new transactions", async () => {
    const result = await importTransactions([tx()]);
    expect(result).toEqual({ inserted: 1, duplicates: 0 });
    expect(await getAllTransactions()).toHaveLength(1);
  });

  it("skips duplicates by id on re-import", async () => {
    await importTransactions([tx()]);
    const result = await importTransactions([tx()]);
    expect(result).toEqual({ inserted: 0, duplicates: 1 });
    expect(await getAllTransactions()).toHaveLength(1);
  });

  it("treats same sourceId from different providers as distinct", async () => {
    await importTransactions([tx({ id: "etherfi:1", sourceId: "1" })]);
    const result = await importTransactions([
      tx({ id: "plasma:1", provider: "plasma", sourceId: "1" }),
    ]);
    expect(result).toEqual({ inserted: 1, duplicates: 0 });
    expect(await getAllTransactions()).toHaveLength(2);
  });
});

describe("re-importing the same CSV", () => {
  beforeEach(async () => {
    await clearAllTransactions();
  });

  it("does not create duplicate transactions for etherfi", async () => {
    const csv = readFileSync(new URL("./fixtures/etherfi.sample.csv", import.meta.url), "utf-8");
    const { transactions } = etherfiParser.parse(csv);

    const first = await importTransactions(transactions);
    const second = await importTransactions(transactions);

    expect(first.inserted).toBe(transactions.length);
    expect(second).toEqual({ inserted: 0, duplicates: transactions.length });
    expect(await getAllTransactions()).toHaveLength(transactions.length);
  });

  it("does not create duplicate transactions for plasma", async () => {
    const csv = readFileSync(new URL("./fixtures/plasma.sample.csv", import.meta.url), "utf-8");
    const { transactions } = plasmaParser.parse(csv);

    const first = await importTransactions(transactions);
    const second = await importTransactions(transactions);

    expect(first.inserted).toBe(transactions.length);
    expect(second).toEqual({ inserted: 0, duplicates: transactions.length });
    expect(await getAllTransactions()).toHaveLength(transactions.length);
  });

  it("does not create duplicate transactions for gnosis", async () => {
    const csv = readFileSync(new URL("./fixtures/gnosis.sample.csv", import.meta.url), "utf-8");
    const { transactions } = gnosisParser.parse(csv);

    const first = await importTransactions(transactions);
    const second = await importTransactions(transactions);

    expect(first.inserted).toBe(transactions.length);
    expect(second).toEqual({ inserted: 0, duplicates: transactions.length });
    expect(await getAllTransactions()).toHaveLength(transactions.length);
  });
});

describe("patchTransaction", () => {
  beforeEach(async () => {
    await clearAllTransactions();
  });

  it("persists a category override without disturbing classification", async () => {
    await importTransactions([tx()]);
    await patchTransaction("etherfi:1", { categoryOverride: "Shopping" });

    const [stored] = await getAllTransactions();
    expect(stored.categoryOverride).toBe("Shopping");
    expect(stored.needsReview).toBe(false); // unrelated field untouched
  });

  it("markReviewed sticks even though the raw row is still genuinely unrecognized", async () => {
    // raw type "card_refund" is unrecognized, so classification alone always
    // flags it — only reviewResolvedManually can make getAllTransactions()
    // stop re-flagging it on every read.
    await importTransactions([tx({ raw: { type: "card_refund" }, needsReview: true, reviewReason: "pre-import reason" })]);

    const [beforeResolve] = await getAllTransactions();
    expect(beforeResolve.needsReview).toBe(true); // reclassify confirms it's still ambiguous

    await markReviewed("etherfi:1");

    const [afterResolve] = await getAllTransactions();
    expect(afterResolve.needsReview).toBe(false);
    expect(afterResolve.reviewResolvedManually).toBe(true);
    expect(afterResolve.type).toBe("unknown"); // type itself is still re-derived from raw
  });

  it("throws for an unknown id rather than silently inserting", async () => {
    await expect(patchTransaction("etherfi:missing", { needsReview: false })).rejects.toThrow();
  });
});

describe("applyCategoryToMerchant", () => {
  beforeEach(async () => {
    await clearAllTransactions();
  });

  it("applies to every transaction sharing the merchant key, across providers", async () => {
    await importTransactions([
      tx({ id: "etherfi:1", sourceId: "1", provider: "etherfi", merchant: "KAM 15-TAFTALIDJE" }),
      tx({ id: "plasma:1", provider: "plasma", sourceId: "1", merchant: "KAM" }),
      tx({ id: "etherfi:2", sourceId: "2", merchant: "Unrelated Shop" }),
    ]);

    const result = await applyCategoryToMerchant("KAM", "Groceries", "KAM");
    expect(result.updated).toBe(2);

    const all = await getAllTransactions();
    const kam1 = all.find((t) => t.id === "etherfi:1")!;
    const kam2 = all.find((t) => t.id === "plasma:1")!;
    const other = all.find((t) => t.id === "etherfi:2")!;
    expect(kam1.categoryOverride).toBe("Groceries");
    expect(kam2.categoryOverride).toBe("Groceries");
    expect(other.categoryOverride).toBeUndefined();
  });

  it("does not clobber a manual per-transaction override", async () => {
    await importTransactions([tx({ id: "etherfi:1", sourceId: "1", merchant: "KAM 15-TAFTALIDJE" })]);
    await setTransactionCategory("etherfi:1", "Shopping"); // explicit manual choice

    await applyCategoryToMerchant("KAM", "Groceries", "KAM");

    const [stored] = await getAllTransactions();
    expect(stored.categoryOverride).toBe("Shopping");
    expect(stored.categoryOverrideSource).toBe("manual");
  });

  it("saves a rule that future imports pick up automatically", async () => {
    await applyCategoryToMerchant("KAM", "Groceries", "KAM");
    expect(await getAllMerchantRules()).toHaveLength(1);

    await importTransactions([tx({ id: "plasma:1", provider: "plasma", sourceId: "1", merchant: "KAM 98-KARPOSH 3" })]);

    const [stored] = await getAllTransactions();
    expect(stored.categoryOverride).toBe("Groceries");
    expect(stored.categoryOverrideSource).toBe("merchant-rule");
  });
});

describe("reclassify-on-read migration", () => {
  beforeEach(async () => {
    await clearAllTransactions();
  });

  it("upgrades a transaction stored under the old Plasma Receive/Send/cashback rules without a re-import", async () => {
    // Simulates data written before "Receive"/"Send"/"Card cashback" became
    // confident classifications instead of flagged "unknown"/"funding"/"transfer".
    await importTransactions([
      tx({
        id: "plasma:1",
        provider: "plasma",
        sourceId: "1",
        merchant: "0xabc",
        amount: -500,
        type: "unknown",
        needsReview: true,
        reviewReason: "stale reason from an older classification",
        raw: { type: "Receive" },
      }),
    ]);

    const [stored] = await getAllTransactions();
    expect(stored.type).toBe("funding");
    expect(stored.needsReview).toBe(false);
  });

  it("backfills EtherFi's cashbackEarned on a transaction imported before that field existed", async () => {
    await importTransactions([
      tx({
        id: "etherfi:1",
        sourceId: "1",
        merchant: "COFFEE SHOP",
        raw: { type: "card_spend", "cashback earned": "0.35", "cashback currency": "USD" },
        // cashbackEarned/cashbackCurrency intentionally absent, as if imported pre-feature
      }),
    ]);

    const [stored] = await getAllTransactions();
    expect(stored.cashbackEarned).toBe(0.35);
    expect(stored.cashbackCurrency).toBe("USD");
  });

  it("reclassifies a formerly-unrecognized EtherFi non-card type once it's mapped, without a re-import", async () => {
    // Simulates data written before "liquid_deposit" was mapped to financial_operation.
    await importTransactions([
      tx({
        id: "etherfi:1",
        sourceId: "1",
        merchant: "liquid_deposit",
        amount: 50,
        type: "unknown",
        needsReview: true,
        reviewReason: "stale reason from an older classification",
        raw: { type: "liquid_deposit" },
      }),
    ]);

    const [stored] = await getAllTransactions();
    expect(stored.type).toBe("financial_operation");
    expect(stored.needsReview).toBe(false);
  });
});

describe("overlapping CSV imports", () => {
  beforeEach(async () => {
    await clearAllTransactions();
  });

  it("does not duplicate a transaction present in two overlapping export windows", async () => {
    const julToSep = etherfiParser.parse(
      "timestamp,type,description,status,amount,currency,card,card holder name,original amount,original currency,cashback earned,cashback currency,category,spending mode\n" +
        "2026-08-01 10:00:00 UTC,card_spend,SHARED ROW               ,CLEARED,5.00,USD,1234,JANE DOE,,,,,,\n" +
        "2026-08-02 10:00:00 UTC,card_spend,JULY-ONLY ROW            ,CLEARED,6.00,USD,1234,JANE DOE,,,,,,\n"
    ).transactions;
    const augToOct = etherfiParser.parse(
      "timestamp,type,description,status,amount,currency,card,card holder name,original amount,original currency,cashback earned,cashback currency,category,spending mode\n" +
        "2026-08-01 10:00:00 UTC,card_spend,SHARED ROW               ,CLEARED,5.00,USD,1234,JANE DOE,,,,,,\n" +
        "2026-09-01 10:00:00 UTC,card_spend,OCT-ONLY ROW             ,CLEARED,7.00,USD,1234,JANE DOE,,,,,,\n"
    ).transactions;

    expect(julToSep[0].id).toBe(augToOct[0].id); // the overlapping row hashes to the same id

    const first = await importTransactions(julToSep);
    const second = await importTransactions(augToOct);

    expect(first).toEqual({ inserted: 2, duplicates: 0 });
    expect(second).toEqual({ inserted: 1, duplicates: 1 }); // only the shared row is skipped
    expect(await getAllTransactions()).toHaveLength(3);
  });
});

describe("clearAllData", () => {
  beforeEach(async () => {
    await clearAllTransactions();
  });

  it("wipes both transactions and saved merchant rules, leaving a clean slate to reimport into", async () => {
    await importTransactions([tx({ id: "etherfi:1", sourceId: "1", merchant: "KAM 15-TAFTALIDJE" })]);
    await applyCategoryToMerchant("KAM", "Groceries", "KAM");
    expect(await getAllTransactions()).toHaveLength(1);
    expect(await getAllMerchantRules()).toHaveLength(1);

    await clearAllData();

    expect(await getAllTransactions()).toHaveLength(0);
    expect(await getAllMerchantRules()).toHaveLength(0);

    // reimporting afterward works cleanly, with no leftover merchant rule reapplying
    await importTransactions([tx({ id: "etherfi:1", sourceId: "1", merchant: "KAM 15-TAFTALIDJE" })]);
    const [reimported] = await getAllTransactions();
    expect(reimported.categoryOverride).toBeUndefined();
  });
});
