import { classifyByMerchantKey, normalizeMerchantKey } from "./merchants";
import type { Transaction } from "./schema";

// Readable buckets shown in the UI. The original provider category is always
// kept on `Transaction.category` — this is a display-only simplification.
export const SIMPLIFIED_CATEGORIES = [
  "Groceries",
  "Restaurants",
  "Fuel",
  "Automotive",
  "Shopping",
  "Travel",
  "Transport",
  "Utilities",
  "Health",
  "Entertainment",
  "Education",
  "Subscriptions",
  "Software",
  "Other",
] as const;

export type SimplifiedCategory = (typeof SIMPLIFIED_CATEGORIES)[number];

// Known MCC prefixes, keyed by the 4-digit code providers prefix their category with.
const MCC_MAP: Record<string, SimplifiedCategory> = {
  "5411": "Groceries",
  "5422": "Groceries",
  "5812": "Restaurants",
  "5813": "Restaurants",
  "5814": "Restaurants",
  "5541": "Fuel",
  "5542": "Fuel",
  "5912": "Health",
  "5977": "Shopping",
  "5999": "Shopping",
  "4900": "Utilities",
  "4814": "Utilities",
  "7832": "Entertainment",
  "7996": "Entertainment",
};

// Fallback keyword match for categories that arrive as free text with no MCC
// prefix (seen in the EtherFi export: "Book Stores", "Bakeries", ...).
const KEYWORD_MAP: { pattern: RegExp; category: SimplifiedCategory }[] = [
  { pattern: /grocery|supermarket|convenience/i, category: "Groceries" },
  { pattern: /restaurant|eating place|bakery|bakeries|caf[eé]|caterer/i, category: "Restaurants" },
  { pattern: /automotive service/i, category: "Automotive" }, // repair/mechanic shops, not fuel
  { pattern: /service station|fuel|gas station/i, category: "Fuel" },
  { pattern: /book store|cosmetic|candy|confection|bicycle|furniture|department|clothing|sporting/i, category: "Shopping" },
  { pattern: /hotel|airline|travel|lodging/i, category: "Travel" },
  { pattern: /utilit|telecommunication|electric|water|sanitary/i, category: "Utilities" },
  { pattern: /drug store|pharmac|optician|membership club|golf/i, category: "Health" },
  { pattern: /movie|theater|entertainment/i, category: "Entertainment" },
];

/** Maps a raw provider category to one of the simplified buckets. Never guesses past a direct match — falls back to "Other". */
export function simplifyCategory(rawCategory: string): SimplifiedCategory {
  const mccMatch = rawCategory.match(/^(\d{4})\b/);
  if (mccMatch && MCC_MAP[mccMatch[1]]) return MCC_MAP[mccMatch[1]];

  for (const { pattern, category } of KEYWORD_MAP) {
    if (pattern.test(rawCategory)) return category;
  }
  return "Other";
}

/**
 * The category shown in the UI, in priority order:
 *  1. manual transaction override
 *  2. saved merchant rule
 *  3. provider MCC category, simplified — EtherFi always has one
 *  4. merchant dictionary (known chain or keyword) — Plasma has no category column at all
 *  5. "Other"
 *
 * Levels 1 and 2 share the same `categoryOverride` field — the ordering
 * between them is enforced at write time instead (db.ts's
 * applyCategoryToMerchant never touches a transaction whose
 * categoryOverrideSource is "manual"), since only one override can be
 * active on a transaction at once.
 */
export function displayCategory(t: Transaction): string {
  if (t.categoryOverride) return t.categoryOverride;

  if (t.category && t.category !== "uncategorized") {
    const fromMcc = simplifyCategory(t.category);
    // Only short-circuits on a real match — a present-but-unrecognized MCC
    // category (e.g. EtherFi's "Discount Store") falls through to the
    // merchant dictionary instead of landing on "Other" prematurely.
    if (fromMcc !== "Other") return fromMcc;
  }

  const merchantCategory = classifyByMerchantKey(normalizeMerchantKey(t.merchant));
  return merchantCategory ?? "Other";
}
