import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectParser } from "../src/lib/parsers/registry";
import { etherfiParser, extractEtherfiCashback } from "../src/lib/parsers/etherfi";
import { gnosisParser } from "../src/lib/parsers/gnosis";
import { plasmaParser } from "../src/lib/parsers/plasma";

const etherfiCsv = readFileSync(new URL("./fixtures/etherfi.sample.csv", import.meta.url), "utf-8");
const plasmaCsv = readFileSync(new URL("./fixtures/plasma.sample.csv", import.meta.url), "utf-8");
const gnosisCsv = readFileSync(new URL("./fixtures/gnosis.sample.csv", import.meta.url), "utf-8");

describe("registry", () => {
  it("detects the right parser from each fixture's header", () => {
    expect(detectParser(etherfiCsv)?.provider).toBe("etherfi");
    expect(detectParser(plasmaCsv)?.provider).toBe("plasma");
    expect(detectParser(gnosisCsv)?.provider).toBe("gnosis");
  });

  it("returns null for an unrecognized header", () => {
    expect(detectParser("foo,bar\n1,2")).toBeNull();
  });
});

describe("etherfiParser", () => {
  it("parses known card_spend rows as spend, trims padded fields", () => {
    const { transactions, errors } = etherfiParser.parse(etherfiCsv);
    expect(errors).toHaveLength(1); // the "not-a-number" amount row
    expect(errors[0].message).toMatch(/amount/i);

    const spend = transactions.find((t) => t.merchant === "COFFEE SHOP");
    expect(spend).toMatchObject({
      provider: "etherfi",
      date: "2026-01-15T10:06:59Z",
      amount: 4.5,
      currency: "USD",
      type: "spend",
      category: "5812 - Eating Places and Restaurants",
      needsReview: false,
    });
  });

  it("flags an unrecognized transaction type instead of guessing", () => {
    const { transactions } = etherfiParser.parse(etherfiCsv);
    const refund = transactions.find((t) => t.merchant === "GROCERY MART" && t.raw["type"] === "card_refund");
    expect(refund).toMatchObject({ type: "unknown", needsReview: true });
    expect(refund?.reviewReason).toMatch(/card_refund/);
  });

  it("gives distinct ids to distinct rows and stable ids across re-parses", () => {
    const first = etherfiParser.parse(etherfiCsv).transactions;
    const second = etherfiParser.parse(etherfiCsv).transactions;
    expect(first.map((t) => t.id)).toEqual(second.map((t) => t.id));
    expect(new Set(first.map((t) => t.id)).size).toBe(first.length);
  });

  it("extracts the per-row cashback earned as a real recorded value", () => {
    const { transactions } = etherfiParser.parse(etherfiCsv);
    const spend = transactions.find((t) => t.merchant === "COFFEE SHOP");
    expect(spend).toMatchObject({ cashbackEarned: 0.13, cashbackCurrency: "USD" });
  });

  it("treats a zero cashback-earned row as no cashback at all", () => {
    expect(extractEtherfiCashback({ "cashback earned": "0", "cashback currency": "" })).toEqual({});
  });

  it("never fabricates a cashback value when the row doesn't have one", () => {
    expect(extractEtherfiCashback({})).toEqual({});
  });

  it("classifies non-card account activity to its own type, not spend/unknown", () => {
    const { transactions } = etherfiParser.parse(etherfiCsv);
    const byRawType = (rawType: string) => transactions.find((t) => t.raw["type"] === rawType)!;

    expect(byRawType("topup")).toMatchObject({ type: "funding", needsReview: false });
    expect(byRawType("liquid_deposit")).toMatchObject({ type: "financial_operation", needsReview: false });
    expect(byRawType("cashback_claim")).toMatchObject({ type: "cashback_claim", needsReview: false });
    expect(byRawType("affiliate_reward")).toMatchObject({ type: "reward", needsReview: false });
    expect(byRawType("borrow")).toMatchObject({ type: "financial_operation", needsReview: false });
  });

  it("still preserves the raw type and the claim's own amount even though it's excluded from cashback", () => {
    const { transactions } = etherfiParser.parse(etherfiCsv);
    const claim = transactions.find((t) => t.raw["type"] === "cashback_claim")!;
    expect(claim.raw["type"]).toBe("cashback_claim");
    expect(claim.amount).toBe(3);
    // The CSV happens to populate the same "cashback earned" column on this
    // row — it's preserved on the transaction, but cashback.ts must not
    // treat it as real card cashback (see cashback.test.ts).
    expect(claim.cashbackEarned).toBe(3);
  });
});

describe("plasmaParser", () => {
  it("parses Card purchase as spend with sign flipped to the normalized convention", () => {
    const { transactions } = plasmaParser.parse(plasmaCsv);
    const purchase = transactions.find((t) => t.merchant === "Market");
    expect(purchase).toMatchObject({
      provider: "plasma",
      date: "2026-01-15T19:43:39",
      amount: 60.53, // source was -60.53 (money out); normalized positive = out
      currency: "USD",
      type: "spend",
      category: "uncategorized",
      needsReview: false,
    });
  });

  it("classifies cashback, receive, and send with confidence when direction matches expectation", () => {
    const { transactions } = plasmaParser.parse(plasmaCsv);
    const cashback = transactions.find((t) => t.raw["type"] === "Card cashback");
    const receive = transactions.find((t) => t.raw["type"] === "Receive");
    const send = transactions.find((t) => t.raw["type"] === "Send");

    expect(cashback).toMatchObject({ type: "cashback", needsReview: false, amount: -8.33 });
    expect(receive).toMatchObject({ type: "funding", needsReview: false, amount: -500 });
    expect(send).toMatchObject({ type: "transfer", needsReview: false, amount: 50 });
  });

  it("flags Receive/Send if the amount direction doesn't match what the type implies", () => {
    const csv =
      "date,type,description,transaction_hash,amount_usd,amount_usd_currency,amount_local,amount_local_currency,fx_rate,fee,fee_currency\n" +
      "2026-01-20 00:00:00,Receive,0xabc,0xhash1,-10.00,USD,,,,,\n" + // normalized +10, not money-in
      "2026-01-21 00:00:00,Send,0xdef,0xhash2,10.00,USD,,,,,\n"; // normalized -10, not money-out
    const { transactions } = plasmaParser.parse(csv);
    expect(transactions[0]).toMatchObject({ type: "unknown", needsReview: true });
    expect(transactions[0].reviewReason).toMatch(/Receive/);
    expect(transactions[1]).toMatchObject({ type: "unknown", needsReview: true });
    expect(transactions[1].reviewReason).toMatch(/Send/);
  });

  it("flags a completely unrecognized type too", () => {
    const { transactions } = plasmaParser.parse(plasmaCsv);
    const other = transactions.find((t) => t.raw["type"] === "Staking reward");
    expect(other).toMatchObject({ type: "unknown", needsReview: true });
    expect(other?.reviewReason).toMatch(/Staking reward/);
  });

  it("uses the on-chain hash as the dedup id when present, a content hash otherwise", () => {
    const { transactions } = plasmaParser.parse(plasmaCsv);
    const receive = transactions.find((t) => t.raw["type"] === "Receive")!;
    expect(receive.sourceId).toBe(
      "0x8956972d646dd2af8cf31d387116e82344c50cce559f4a7db345978d6a2ccb60"
    );
    const purchase = transactions.find((t) => t.merchant === "Market")!;
    expect(purchase.sourceId).not.toBe("");
  });
});

describe("gnosisParser", () => {
  it("classifies an Approved row as spend, normalizing the sign and keeping EUR", () => {
    const { transactions } = gnosisParser.parse(gnosisCsv);
    const spend = transactions.find((t) => t.merchant === "Kit Go 70 Taftalidje");
    expect(spend).toMatchObject({
      provider: "gnosis",
      date: "2026-10-03",
      amount: 18.01, // source was -18.01 (money out); normalized positive = out
      currency: "EUR",
      type: "spend",
      needsReview: false,
    });
  });

  it("classifies a Refunded row as refund (money in)", () => {
    const { transactions } = gnosisParser.parse(gnosisCsv);
    const refund = transactions.find((t) => t.merchant === "Gorgiev Invest Dooel")!;
    expect(refund).toMatchObject({ type: "refund", amount: -2.35, currency: "EUR" });
  });

  it("excludes a Declined row entirely — no funds moved, nothing to import", () => {
    const { transactions, errors } = gnosisParser.parse(gnosisCsv);
    expect(transactions.find((t) => t.merchant === "Netflix Com")).toBeUndefined();
    const declined = errors.find((e) => e.raw?.["Merchant"] === "Netflix Com");
    expect(declined?.message).toMatch(/Declined/);
    expect(declined?.message).toMatch(/No funds/);
  });

  it("flags an unrecognized status instead of guessing", () => {
    const { transactions } = gnosisParser.parse(gnosisCsv);
    const weird = transactions.find((t) => t.merchant === "Weird Pending Thing")!;
    expect(weird).toMatchObject({ type: "unknown", needsReview: true });
    expect(weird.reviewReason).toMatch(/Pending/);
  });

  it("errors a row with an unparseable Amount (EUR) instead of inventing one", () => {
    const { errors } = gnosisParser.parse(gnosisCsv);
    const amountError = errors.find((e) => e.raw?.["Merchant"] === "Not A Number Merchant");
    expect(amountError?.message).toMatch(/Amount \(EUR\)/);
  });

  it("uses the provider's own Transaction ID column for dedup, stable across re-parses", () => {
    const first = gnosisParser.parse(gnosisCsv).transactions;
    const second = gnosisParser.parse(gnosisCsv).transactions;
    expect(first.map((t) => t.id)).toEqual(second.map((t) => t.id));
    expect(new Set(first.map((t) => t.id)).size).toBe(first.length);
  });
});
