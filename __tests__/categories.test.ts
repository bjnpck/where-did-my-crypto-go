import { describe, expect, it } from "vitest";
import { displayCategory, simplifyCategory } from "../src/lib/categories";
import type { Transaction } from "../src/lib/schema";

describe("simplifyCategory", () => {
  it("maps a known MCC-prefixed category", () => {
    expect(simplifyCategory("5411 - Grocery Stores and Supermarkets")).toBe("Groceries");
    expect(simplifyCategory("5812 - Eating Places and Restaurants")).toBe("Restaurants");
    expect(simplifyCategory("5541 - Service Stations")).toBe("Fuel");
  });

  it("falls back to keyword matching for free-text categories", () => {
    expect(simplifyCategory("Book Stores")).toBe("Shopping");
    expect(simplifyCategory("Bakeries")).toBe("Restaurants");
  });

  it("classifies automotive service shops as Automotive, not Fuel", () => {
    // Real case: "O M DRAGAN DOOEL OM SE" (a mechanic) carries this MCC text.
    expect(simplifyCategory("Automotive Service Shops (Non-Dealer)")).toBe("Automotive");
    expect(simplifyCategory("5541 - Service Stations")).toBe("Fuel"); // still Fuel
  });

  it("falls back to Other for anything unrecognized, never invents a bucket", () => {
    expect(simplifyCategory("9999 - Totally Unknown MCC")).toBe("Other");
    expect(simplifyCategory("uncategorized")).toBe("Other");
  });
});

describe("displayCategory", () => {
  const base: Transaction = {
    id: "etherfi:1",
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
  };

  it("uses the simplified original category when no override is set", () => {
    expect(displayCategory(base)).toBe("Groceries");
  });

  it("prefers a user override over the simplified original", () => {
    expect(displayCategory({ ...base, categoryOverride: "Shopping" })).toBe("Shopping");
  });

  it("falls back to merchant-name classification when there is no provider category (Plasma)", () => {
    const plasmaLike: Transaction = { ...base, category: "uncategorized", merchant: "Wolt" };
    expect(displayCategory(plasmaLike)).toBe("Restaurants");
  });

  it("falls back to Other when neither category nor merchant is recognized", () => {
    const plasmaLike: Transaction = { ...base, category: "uncategorized", merchant: "Gorgiev Invest Dooel" };
    expect(displayCategory(plasmaLike)).toBe("Other");
  });

  it("enforces the full precedence chain: override > MCC > merchant dictionary > Other", () => {
    // override beats everything, even a recognized MCC and a recognized merchant
    expect(
      displayCategory({ ...base, merchant: "Wolt", categoryOverride: "Travel" })
    ).toBe("Travel");

    // provider MCC beats the merchant dictionary even if the merchant is also recognized
    expect(
      displayCategory({ ...base, merchant: "Wolt", category: "5541 - Service Stations" })
    ).toBe("Fuel");

    // no override, no usable category -> merchant dictionary
    expect(displayCategory({ ...base, category: "uncategorized", merchant: "Petrol" })).toBe("Fuel");

    // no override, no usable category, unrecognized merchant -> Other
    expect(displayCategory({ ...base, category: "uncategorized", merchant: "Vallis MG" })).toBe("Other");
  });

  it("falls through to the merchant dictionary when the provider category is present but unrecognized", () => {
    // Real case from the EtherFi export: category "Discount Store" doesn't
    // map via MCC/keyword, but the merchant is a known grocery chain.
    expect(
      displayCategory({ ...base, category: "Discount Store", merchant: "Ramstor Makedonija" })
    ).toBe("Groceries");
  });

  it("resolves the new Education/Transport/Subscriptions categories via the merchant dictionary", () => {
    expect(
      displayCategory({ ...base, category: "uncategorized", merchant: "JAHJA KEMAL KARPOS" })
    ).toBe("Education");
    expect(
      displayCategory({ ...base, category: "uncategorized", merchant: "AMZS PE MURSKA SOBOTA" })
    ).toBe("Transport");
    expect(
      displayCategory({ ...base, category: "uncategorized", merchant: "Lyn Alden Premium" })
    ).toBe("Subscriptions");
  });

  it("a manual override still beats a new dictionary entry", () => {
    expect(
      displayCategory({ ...base, category: "uncategorized", merchant: "AMZS PE MURSKA SOBOTA", categoryOverride: "Travel" })
    ).toBe("Travel");
  });
});
