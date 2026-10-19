import { parseCsvWithHeader } from "../csv";
import { stableHash } from "../hash";
import type { ParseError, Transaction } from "../schema";
import type { ProviderParser } from "./types";

// Verified against a real Plasma export (src/lib/parsers/__fixtures__/plasma.sample.csv).
// Columns: date,type,description,transaction_hash,amount_usd,amount_usd_currency,
//          amount_local,amount_local_currency,fx_rate,fee,fee_currency
const EXPECTED_HEADER = [
  "date",
  "type",
  "description",
  "transaction_hash",
  "amount_usd",
  "amount_usd_currency",
];

interface Classification {
  type: Transaction["type"];
  needsReview: boolean;
  reviewReason?: string;
}

// Plasma's amount sign is "positive = money in, negative = money out" — the
// opposite of our normalized convention — so every amount is negated when
// building the Transaction. The rules below work off that normalized amount
// (positive = out, negative = in), confirming direction rather than assuming it.
//
// "Card purchase" and "Card cashback" never carry a transaction_hash; "Receive"
// and "Send" always do (on-chain transfers).
export function classifyPlasmaRow(row: Record<string, string>, normalizedAmount: number): Classification {
  switch (row["type"]) {
    case "Card purchase":
      return { type: "spend", needsReview: false };
    case "Card cashback":
      return { type: "cashback", needsReview: false };
    case "Receive":
      return normalizedAmount < 0
        ? { type: "funding", needsReview: false }
        : {
            type: "unknown",
            needsReview: true,
            reviewReason: "Receive with a non-negative normalized amount — expected money in, direction is unexpected.",
          };
    case "Send":
      return normalizedAmount > 0
        ? { type: "transfer", needsReview: false }
        : {
            type: "unknown",
            needsReview: true,
            reviewReason: "Send with a non-positive normalized amount — expected money out, direction is unexpected.",
          };
    default:
      return {
        type: "unknown",
        needsReview: true,
        reviewReason: `Unrecognized Plasma transaction type "${row["type"]}".`,
      };
  }
}

function toIsoTimestamp(raw: string): string | null {
  // "2026-09-04 19:43:39" -> "2026-09-04T19:43:39" (no timezone given in the
  // source, so none is asserted here — don't guess it's UTC).
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/);
  if (!m) return null;
  return `${m[1]}T${m[2]}`;
}

export const plasmaParser: ProviderParser = {
  provider: "plasma",
  label: "Plasma",
  detect(header) {
    return EXPECTED_HEADER.every((col) => header.includes(col));
  },
  parse(csvText) {
    const rows = parseCsvWithHeader(csvText);
    const transactions: Transaction[] = [];
    const errors: ParseError[] = [];

    rows.forEach((row, i) => {
      const rowNum = i + 1;
      const rawAmount = Number(row["amount_usd"]);
      const date = toIsoTimestamp(row["date"]);

      if (!row["date"] || date === null) {
        errors.push({ row: rowNum, message: `Unparseable date: "${row["date"]}"`, raw: row });
        return;
      }
      if (!Number.isFinite(rawAmount)) {
        errors.push({ row: rowNum, message: `Unparseable amount_usd: "${row["amount_usd"]}"`, raw: row });
        return;
      }
      if (!row["amount_usd_currency"]) {
        errors.push({ row: rowNum, message: "Missing amount_usd_currency", raw: row });
        return;
      }

      const amount = -rawAmount;
      const { type, needsReview, reviewReason } = classifyPlasmaRow(row, amount);

      const sourceId =
        row["transaction_hash"]?.trim() ||
        stableHash([row["date"], row["type"], row["description"], row["amount_usd"]].join("|"));

      transactions.push({
        id: `plasma:${sourceId}`,
        date,
        provider: "plasma",
        merchant: row["description"].trim(),
        amount,
        currency: row["amount_usd_currency"],
        type,
        category: "uncategorized", // Plasma's export has no category column
        sourceId,
        needsReview,
        reviewReason,
        raw: row,
      });
    });

    return { transactions, errors };
  },
};
