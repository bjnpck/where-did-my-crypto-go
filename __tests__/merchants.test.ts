import { describe, expect, it } from "vitest";
import { classifyByMerchantKey, displayMerchantName, normalizeMerchantKey } from "../src/lib/merchants";

describe("normalizeMerchantKey", () => {
  it("strips trailing store-number tokens", () => {
    expect(normalizeMerchantKey("DM DROGERIE MARKT 28")).toBe("DM");
    expect(normalizeMerchantKey("KAM 15-TAFTALIDJE")).toBe("KAM");
    expect(normalizeMerchantKey("LUKOIL BS STRAZA 002")).toBe("LUKOIL");
  });

  it("is case-insensitive", () => {
    expect(normalizeMerchantKey("Veropulos")).toBe(normalizeMerchantKey("VEROPULOS"));
    expect(normalizeMerchantKey("dm drogerie markt")).toBe(normalizeMerchantKey("DM DROGERIE MARKT 3"));
  });

  it("collapses known chains to the same key across providers' different spellings", () => {
    expect(normalizeMerchantKey("BENZINSKA STANICA OKTA")).toBe("OKTA");
    expect(normalizeMerchantKey("Okta")).toBe("OKTA");
    expect(normalizeMerchantKey("Lidl Slovenija")).toBe("LIDL");
    expect(normalizeMerchantKey("Burger King")).toBe("BURGER KING");
  });

  it("does not merge unrelated merchants that merely share a substring", () => {
    // "EUROFARM VERO 2 KOZL" contains "VERO" but not the full "VEROPULOS" token.
    expect(normalizeMerchantKey("EUROFARM VERO 2 KOZL")).not.toBe("VEROPULOS");
  });

  it("collapses the newly added confidently-identifiable brands", () => {
    expect(normalizeMerchantKey("Interspar")).toBe("INTERSPAR");
    expect(normalizeMerchantKey("Ramstor Makedonija")).toBe("RAMSTOR");
    expect(normalizeMerchantKey("Petrol")).toBe("PETROL");
    expect(normalizeMerchantKey("Sports Direct")).toBe("SPORTS DIRECT");
    expect(normalizeMerchantKey("OpenAI")).toBe("OPENAI");
    expect(normalizeMerchantKey("Anthropic")).toBe("ANTHROPIC");
  });
});

describe("classifyByMerchantKey", () => {
  it("returns a category for known chains", () => {
    expect(classifyByMerchantKey("KAM")).toBe("Groceries");
    expect(classifyByMerchantKey("WOLT")).toBe("Restaurants");
    expect(classifyByMerchantKey("OKTA")).toBe("Fuel");
    expect(classifyByMerchantKey("DM")).toBe("Health");
  });

  it("returns a category for the newly added brands requested by name", () => {
    expect(classifyByMerchantKey("INTERSPAR")).toBe("Groceries");
    expect(classifyByMerchantKey("PETROL")).toBe("Fuel");
    expect(classifyByMerchantKey("SPORTS DIRECT")).toBe("Shopping");
    expect(classifyByMerchantKey("OPENAI")).toBe("Software");
    expect(classifyByMerchantKey("ANTHROPIC")).toBe("Software");
  });

  it("falls back to a keyword match for unambiguous regional business-type words", () => {
    expect(classifyByMerchantKey(normalizeMerchantKey("Hotel Zvezda"))).toBe("Travel");
    expect(classifyByMerchantKey(normalizeMerchantKey("Apteka Viola"))).toBe("Health");
    expect(classifyByMerchantKey(normalizeMerchantKey("Caffe Praline"))).toBe("Restaurants");
    expect(classifyByMerchantKey(normalizeMerchantKey("PZO KARDIOMEDIKA SRBINOVS"))).toBe("Health");
    expect(classifyByMerchantKey(normalizeMerchantKey("KINOSENS SKOPJE"))).toBe("Entertainment");
  });

  it("returns null for anything not in the curated list, never guesses", () => {
    expect(classifyByMerchantKey("GORGIEV INVEST DOOEL")).toBeNull();
    // Still ambiguous after the "Other" audit — no confident signal either way.
    expect(classifyByMerchantKey(normalizeMerchantKey("Viki"))).toBeNull();
    expect(classifyByMerchantKey(normalizeMerchantKey("Vegera Partizanska"))).toBeNull();
    expect(classifyByMerchantKey(normalizeMerchantKey("Ssejk Ssop Dooel"))).toBeNull(); // transliteration guess, deliberately not matched
  });
});

describe("approved classifications from the 'Other' merchant audit", () => {
  it("collapses each to its own canonical key and resolves the approved category", () => {
    const cases: [string, string, string][] = [
      ["JAHJA KEMAL KARPOS", "JAHJA KEMAL", "Education"],
      ["AMZS PE MURSKA SOBOTA", "AMZS", "Transport"],
      ["Lyn Alden Premium", "LYN ALDEN", "Subscriptions"],
      ["Olimpiski bazen", "OLIMPISKI BAZEN", "Health"],
      ["Prosvetno Delo 21 Ci", "PROSVETNO DELO", "Shopping"],
      ["Ралекс маркети", "RALEKS", "Groceries"],
    ];
    for (const [raw, expectedKey, expectedCategory] of cases) {
      const key = normalizeMerchantKey(raw);
      expect(key).toBe(expectedKey);
      expect(classifyByMerchantKey(key)).toBe(expectedCategory);
    }
  });

  it("classifies the generic-word cases via keyword, without collapsing the key", () => {
    expect(classifyByMerchantKey(normalizeMerchantKey("CVEKARA FIORE 2"))).toBe("Shopping");
    expect(classifyByMerchantKey(normalizeMerchantKey("SEG PARKOMAT 3"))).toBe("Transport");
    expect(classifyByMerchantKey(normalizeMerchantKey("Exp Tobacco"))).toBe("Shopping");
    // keyword matches don't rename the key — distinct florists/kiosks stay distinct merchants
    expect(normalizeMerchantKey("CVEKARA FIORE 2")).toBe("CVEKARA FIORE");
  });

  it("classifies WAH USD - USD ECOM as Travel once identified as Wizz Air", () => {
    expect(classifyByMerchantKey(normalizeMerchantKey("WAH USD - USD ECOM"))).toBe("Travel");
  });
});

describe("displayMerchantName", () => {
  it("aliases Wizz Air's cryptic statement descriptor", () => {
    expect(displayMerchantName("WAH USD - USD ECOM")).toBe("Wizz Air");
  });

  it("preserves the original text for anything without an alias", () => {
    expect(displayMerchantName("Burger King")).toBe("Burger King");
    expect(displayMerchantName("Gorgiev Invest Dooel")).toBe("Gorgiev Invest Dooel");
  });
});
