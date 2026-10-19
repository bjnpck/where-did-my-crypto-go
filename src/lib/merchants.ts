import type { SimplifiedCategory } from "./categories";

// Shared across providers: groups "the same merchant" under one key despite
// case differences, punctuation, and per-location store numbers, so a
// manual category edit or a persistent merchant rule applies consistently.
//
// Deliberately conservative — only strips trailing store-number tokens and
// collapses a short curated list of known chains. No fuzzy/similarity
// matching: merchants that aren't an exact token match stay distinct rather
// than risk merging two unrelated businesses. Verified against the real
// EtherFi and Plasma exports — every entry below is a confidently
// identifiable brand or an unambiguous regional business-type word, not a
// guess about a generic company registration name (e.g. "Gorgiev Invest
// Dooel" stays "Other" — a DOOEL suffix alone says nothing about what the
// business sells).
interface KnownBrand {
  pattern: RegExp;
  key: string;
  category: SimplifiedCategory;
  displayName?: string; // shown in the UI instead of the raw merchant text; raw text is still preserved on the transaction
}

// Collapses the merchant key itself (so store-level naming differences
// across providers resolve to one rule), AND determines the category.
const KNOWN_BRANDS: KnownBrand[] = [
  { pattern: /\bKAM\b/, key: "KAM", category: "Groceries" },
  { pattern: /\bVEROPULOS\b/, key: "VEROPULOS", category: "Groceries" },
  { pattern: /\bLIDL\b/, key: "LIDL", category: "Groceries" },
  { pattern: /\bINTERSPAR\b/, key: "INTERSPAR", category: "Groceries" },
  { pattern: /\bRAMSTOR\b/, key: "RAMSTOR", category: "Groceries" },
  { pattern: /\bWOLT\b/, key: "WOLT", category: "Restaurants" },
  { pattern: /\bBURGER KING\b/, key: "BURGER KING", category: "Restaurants" },
  { pattern: /\bDM\b/, key: "DM", category: "Health" },
  { pattern: /\bSYNEVO\b/, key: "SYNEVO", category: "Health" },
  { pattern: /\bOKTA\b/, key: "OKTA", category: "Fuel" },
  { pattern: /\bPETROL\b/, key: "PETROL", category: "Fuel" },
  { pattern: /\bLUKOIL\b/, key: "LUKOIL", category: "Fuel" },
  { pattern: /\bEKO\b/, key: "EKO", category: "Fuel" },
  { pattern: /\bBP\b/, key: "BP", category: "Fuel" },
  { pattern: /\bSPORTS DIRECT\b/, key: "SPORTS DIRECT", category: "Shopping" },
  { pattern: /\bSPORT VISION\b/, key: "SPORT VISION", category: "Shopping" },
  { pattern: /\bIKEA\b/, key: "IKEA", category: "Shopping" },
  { pattern: /\bZARA\b/, key: "ZARA", category: "Shopping" },
  { pattern: /\bEVN\b/, key: "EVN", category: "Utilities" },
  { pattern: /\bOPENAI\b/, key: "OPENAI", category: "Software" },
  { pattern: /\bANTHROPIC\b/, key: "ANTHROPIC", category: "Software" },
  { pattern: /\bMOONSHOT AI\b/, key: "MOONSHOT AI", category: "Software" },
  { pattern: /\bX CORP\b/, key: "X CORP", category: "Software" },
  { pattern: /\bPORKBUN\.COM\b/, key: "PORKBUN.COM", category: "Software" },
  { pattern: /\bBLOCKSCOUT\.COM\b/, key: "BLOCKSCOUT.COM", category: "Software" },

  // Approved from the "Other" merchant audit — specific identifiable
  // entities (a school, a company, a venue, a chain), not generic words,
  // so each collapses to its own canonical key.
  { pattern: /\bJAHJA KEMAL\b/, key: "JAHJA KEMAL", category: "Education" },
  { pattern: /\bAMZS\b/, key: "AMZS", category: "Transport" },
  { pattern: /\bLYN ALDEN\b/, key: "LYN ALDEN", category: "Subscriptions" },
  { pattern: /\bOLIMPISKI BAZEN\b/, key: "OLIMPISKI BAZEN", category: "Health" },
  { pattern: /\bPROSVETNO DELO\b/, key: "PROSVETNO DELO", category: "Shopping" },
  { pattern: /РАЛЕКС/, key: "RALEKS", category: "Groceries" }, // Cyrillic: "Ралекс маркети"
  // "WAH USD - USD ECOM" is Wizz Air's card-statement descriptor.
  { pattern: /\bWAH USD\b/, key: "WIZZ AIR", category: "Travel", displayName: "Wizz Air" },
];

// Category-only fallback for merchant names that embed an unambiguous
// regional business-type word but aren't a chain worth collapsing into one
// merchant-rule key (e.g. each pharmacy keeps its own name/key, but any
// "Apteka ..." is confidently a pharmacy). Never renames the key.
const KEYWORD_RULES: { pattern: RegExp; category: SimplifiedCategory }[] = [
  { pattern: /HOTEL/, category: "Travel" },
  { pattern: /AUTOCEST/, category: "Travel" }, // autocesta/autoceste = highway/toll road
  { pattern: /APTEKA/, category: "Health" }, // pharmacy
  { pattern: /LABORATORIJA/, category: "Health" },
  { pattern: /UROLOGIJA/, category: "Health" },
  { pattern: /MEDIK/, category: "Health" }, // catches "Kardiomedika" etc.
  { pattern: /KAFE|CAFE|CAFFE/, category: "Restaurants" },
  { pattern: /RESTORAN/, category: "Restaurants" },
  { pattern: /PEKARA/, category: "Restaurants" }, // bakery
  { pattern: /VODOVOD/, category: "Utilities" }, // water utility
  { pattern: /TELEKOM/, category: "Utilities" },
  { pattern: /KINO/, category: "Entertainment" }, // cinema, e.g. "Kinosens"
  { pattern: /\bMALL\b/, category: "Shopping" },
  { pattern: /BIKE/, category: "Shopping" },
  { pattern: /CVEKARA/, category: "Shopping" }, // florist
  { pattern: /PARKOMAT/, category: "Transport" }, // parking meter
  { pattern: /TOBACCO/, category: "Shopping" },
];

/** Canonical key for "same merchant" grouping, shared across providers. */
export function normalizeMerchantKey(rawMerchant: string): string {
  let s = rawMerchant.trim().toUpperCase().replace(/\s+/g, " ");

  const tokens = s.split(" ");
  while (tokens.length > 1 && /\d/.test(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  s = tokens.join(" ");

  const brand = KNOWN_BRANDS.find((b) => b.pattern.test(s));
  return brand ? brand.key : s;
}

/** A category for known merchant chains or keywords; null for anything not in the curated list — never guessed. */
export function classifyByMerchantKey(merchantKey: string): SimplifiedCategory | null {
  const brand = KNOWN_BRANDS.find((b) => b.key === merchantKey);
  if (brand) return brand.category;
  return KEYWORD_RULES.find((k) => k.pattern.test(merchantKey))?.category ?? null;
}

/**
 * A friendlier display name for a known brand with a cryptic card-statement
 * descriptor (e.g. "WAH USD - USD ECOM" -> "Wizz Air"). The raw merchant
 * text on the transaction is never changed — this only affects what's
 * rendered. Returns the original text when there's no alias.
 */
export function displayMerchantName(rawMerchant: string): string {
  const key = normalizeMerchantKey(rawMerchant);
  const brand = KNOWN_BRANDS.find((b) => b.key === key);
  return brand?.displayName ?? rawMerchant;
}
