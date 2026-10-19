import { parseCsvWithHeader } from "../csv";
import { stableHash } from "../hash";
import type { ParseError, Transaction } from "../schema";
import type { ProviderParser } from "./types";

// Verified against a real EtherFi export (src/lib/parsers/__fixtures__/etherfi.sample.csv).
// Columns: timestamp,type,description,status,amount,currency,card,card holder name,
//          original amount,original currency,cashback earned,cashback currency,category,spending mode
const EXPECTED_HEADER = [
  "timestamp",
  "type",
  "description",
  "status",
  "amount",
  "currency",
  "card",
  "card holder name",
  "original amount",
  "original currency",
  "cashback earned",
  "cashback currency",
  "category",
  "spending mode",
];

// Verified against two real EtherFi exports. The second covers DeFi-style
// account activity (lending, yield, bridging, referrals) alongside card
// spend — none of that is a card transaction, so each maps to its own
// non-card type rather than being folded into spend/refund/funding/transfer.
const KNOWN_TYPES: Record<string, Transaction["type"]> = {
  card_spend: "spend",
  topup: "funding",
  stargate_execute_bridge: "transfer",
  liquid_deposit: "financial_operation",
  liquid_execute_withdrawal: "financial_operation",
  borrow: "financial_operation",
  swap: "financial_operation",
  cashback_claim: "cashback_claim",
  affiliate_reward: "reward",
  affiliate_payout: "reward_payout",
  borrow_cashback: "borrowing_reward",
};

export function classifyEtherfiRow(
  row: Record<string, string>
): { type: Transaction["type"]; needsReview: boolean; reviewReason?: string } {
  const knownType = KNOWN_TYPES[row["type"]];
  if (knownType) return { type: knownType, needsReview: false };
  return {
    type: "unknown",
    needsReview: true,
    reviewReason: `Unrecognized EtherFi transaction type "${row["type"]}" — not in the known set (${Object.keys(KNOWN_TYPES).join(", ")}).`,
  };
}

/**
 * EtherFi records a reward earned *on* each spend row via "cashback earned"/
 * "cashback currency" columns — a real recorded value, not an estimate.
 * Only set when it's a genuine positive amount with a currency; a "0,"
 * row (seen in the real export) means no reward was earned.
 */
export function extractEtherfiCashback(
  row: Record<string, string>
): { cashbackEarned?: number; cashbackCurrency?: string } {
  const earned = Number(row["cashback earned"]);
  const currency = row["cashback currency"]?.trim();
  if (Number.isFinite(earned) && earned > 0 && currency) {
    return { cashbackEarned: earned, cashbackCurrency: currency };
  }
  return {};
}

function toIsoTimestamp(raw: string): string | null {
  // "2026-10-19 10:06:59 UTC" -> "2026-10-19T10:06:59Z"
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/);
  if (!m) return null;
  return `${m[1]}T${m[2]}Z`;
}

export const etherfiParser: ProviderParser = {
  provider: "etherfi",
  label: "EtherFi",
  detect(header) {
    return EXPECTED_HEADER.every((col) => header.includes(col));
  },
  parse(csvText) {
    const rows = parseCsvWithHeader(csvText);
    const transactions: Transaction[] = [];
    const errors: ParseError[] = [];

    rows.forEach((row, i) => {
      const rowNum = i + 1;
      const amount = Number(row["amount"]);
      const date = toIsoTimestamp(row["timestamp"]);

      if (!row["timestamp"] || date === null) {
        errors.push({ row: rowNum, message: `Unparseable timestamp: "${row["timestamp"]}"`, raw: row });
        return;
      }
      if (!Number.isFinite(amount)) {
        errors.push({ row: rowNum, message: `Unparseable amount: "${row["amount"]}"`, raw: row });
        return;
      }
      if (!row["currency"]) {
        errors.push({ row: rowNum, message: "Missing currency", raw: row });
        return;
      }

      const { type, needsReview, reviewReason } = classifyEtherfiRow(row);
      const { cashbackEarned, cashbackCurrency } = extractEtherfiCashback(row);

      const sourceId = stableHash(
        [row["timestamp"], row["card"], row["amount"], row["currency"], row["description"]].join("|")
      );

      transactions.push({
        id: `etherfi:${sourceId}`,
        date,
        provider: "etherfi",
        merchant: row["description"].trim(),
        amount,
        currency: row["currency"],
        type,
        category: row["category"]?.trim() || "uncategorized",
        sourceId,
        needsReview,
        reviewReason,
        raw: row,
        cashbackEarned,
        cashbackCurrency,
      });
    });

    return { transactions, errors };
  },
};
