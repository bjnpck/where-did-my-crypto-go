import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { normalizeMerchantKey } from "./merchants";
import { reclassify } from "./parsers/reclassify";
import type { Transaction } from "./schema";

export interface MerchantRule {
  merchantKey: string;
  category: string;
  sampleMerchant: string; // a raw merchant name that produced this key, for display
  updatedAt: string;
}

interface TrackerDB extends DBSchema {
  transactions: {
    key: string; // Transaction.id
    value: Transaction;
    indexes: { "by-date": string; "by-provider": string };
  };
  merchantRules: {
    key: string; // merchantKey
    value: MerchantRule;
  };
}

let dbPromise: Promise<IDBPDatabase<TrackerDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<TrackerDB>("crypto-card-tracker", 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore("transactions", { keyPath: "id" });
          store.createIndex("by-date", "date");
          store.createIndex("by-provider", "provider");
        }
        if (oldVersion < 2) {
          db.createObjectStore("merchantRules", { keyPath: "merchantKey" });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Inserts transactions, skipping any whose id already exists. A new
 * transaction whose merchant matches a saved merchant rule gets that
 * category applied automatically. Returns counts.
 */
export async function importTransactions(
  transactions: Transaction[]
): Promise<{ inserted: number; duplicates: number }> {
  const db = await getDb();
  const rules = await db.getAll("merchantRules");
  const ruleByKey = new Map(rules.map((r) => [r.merchantKey, r]));

  const tx = db.transaction("transactions", "readwrite");
  let inserted = 0;
  let duplicates = 0;
  for (const t of transactions) {
    const existing = await tx.store.get(t.id);
    if (existing) {
      duplicates++;
      continue;
    }
    const rule = ruleByKey.get(normalizeMerchantKey(t.merchant));
    await tx.store.put(
      rule ? { ...t, categoryOverride: rule.category, categoryOverrideSource: "merchant-rule" } : t
    );
    inserted++;
  }
  await tx.done;
  return { inserted, duplicates };
}

/**
 * Reads all transactions, re-deriving type/needsReview from the stored raw
 * row under the current classification rules and persisting any changes.
 * This is what lets classification-logic fixes apply to already-imported
 * data without the user clearing storage or re-importing.
 */
export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await getDb();
  const all = await db.getAll("transactions");

  const tx = db.transaction("transactions", "readwrite");
  const reclassified: Transaction[] = [];
  for (const t of all) {
    const next = reclassify(t);
    if (next !== t) await tx.store.put(next);
    reclassified.push(next);
  }
  await tx.done;

  return reclassified.sort((a, b) => b.date.localeCompare(a.date));
}

export async function clearAllTransactions(): Promise<void> {
  const db = await getDb();
  await db.clear("transactions");
}

/** Wipes every imported transaction and every saved merchant/category rule — a full reset. */
export async function clearAllData(): Promise<void> {
  const db = await getDb();
  await db.clear("transactions");
  await db.clear("merchantRules");
}

/** Applies a partial update (category override, review status) to a stored transaction. */
export async function patchTransaction(
  id: string,
  patch: Partial<
    Pick<Transaction, "categoryOverride" | "categoryOverrideSource" | "needsReview" | "reviewResolvedManually">
  >
): Promise<void> {
  const db = await getDb();
  const existing = await db.get("transactions", id);
  if (!existing) throw new Error(`No transaction with id "${id}"`);
  await db.put("transactions", { ...existing, ...patch });
}

/** A single-transaction category edit. Takes precedence over merchant rules — see applyCategoryToMerchant. */
export async function setTransactionCategory(id: string, category: string): Promise<void> {
  await patchTransaction(id, { categoryOverride: category, categoryOverrideSource: "manual" });
}

/** A human has looked at a still-ambiguous transaction and cleared the flag; reclassify() won't re-flag it. */
export async function markReviewed(id: string): Promise<void> {
  await patchTransaction(id, { needsReview: false, reviewResolvedManually: true });
}

/**
 * Saves a merchant rule and applies it to every current transaction sharing
 * that merchant key, across providers — except ones with a manual override,
 * which are left alone. Future imports pick up the rule automatically
 * (see importTransactions). Returns how many transactions were updated.
 */
export async function applyCategoryToMerchant(
  merchantKey: string,
  category: string,
  sampleMerchant: string
): Promise<{ updated: number }> {
  const db = await getDb();
  await db.put("merchantRules", { merchantKey, category, sampleMerchant, updatedAt: new Date().toISOString() });

  const all = await db.getAll("transactions");
  const tx = db.transaction("transactions", "readwrite");
  let updated = 0;
  for (const t of all) {
    if (normalizeMerchantKey(t.merchant) !== merchantKey) continue;
    if (t.categoryOverrideSource === "manual") continue;
    await tx.store.put({ ...t, categoryOverride: category, categoryOverrideSource: "merchant-rule" });
    updated++;
  }
  await tx.done;
  return { updated };
}

export async function getAllMerchantRules(): Promise<MerchantRule[]> {
  const db = await getDb();
  return db.getAll("merchantRules");
}
