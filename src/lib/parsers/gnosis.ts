import { parseCsvWithHeader } from "../csv";
import type { ParseError, Transaction } from "../schema";
import type { ProviderParser } from "./types";

// Verified against a real Gnosis (Rebind) card statement export
// (src/lib/parsers/__fixtures__/gnosis.sample.csv). Columns:
// Date,Card,Merchant,Location,Amount (EUR),Amount (local),Currency,Status,Reason,Transaction ID
//
// "Amount (EUR)" is always EUR-denominated (the card's settlement currency),
// regardless of the local "Currency"/"Amount (local)" the merchant charged
// in — so that's what we normalize into `amount`/`currency`. Its sign is
// "negative = money out, positive = money in" — the opposite of our
// normalized convention — so it's negated when building the Transaction.
const EXPECTED_HEADER = ["Date", "Card", "Merchant", "Location", "Amount (EUR)", "Currency", "Status", "Transaction ID"];

interface Classification {
  type: Transaction["type"];
  needsReview: boolean;
  reviewReason?: string;
}

// "Declined" never moved money (no funds, wrong code, etc.) — not a real
// transaction, so it's excluded at parse time rather than classified.
export function isDeclinedGnosisRow(row: Record<string, string>): boolean {
  return row["Status"] === "Declined";
}

export function classifyGnosisRow(row: Record<string, string>): Classification {
  switch (row["Status"]) {
    case "Approved":
      return { type: "spend", needsReview: false };
    case "Refunded":
      return { type: "refund", needsReview: false };
    default:
      return {
        type: "unknown",
        needsReview: true,
        reviewReason: `Unrecognized Gnosis card statement status "${row["Status"]}".`,
      };
  }
}

export const gnosisParser: ProviderParser = {
  provider: "gnosis",
  label: "Gnosis",
  detect(header) {
    return EXPECTED_HEADER.every((col) => header.includes(col));
  },
  parse(csvText) {
    const rows = parseCsvWithHeader(csvText);
    const transactions: Transaction[] = [];
    const errors: ParseError[] = [];

    rows.forEach((row, i) => {
      const rowNum = i + 1;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(row["Date"])) {
        errors.push({ row: rowNum, message: `Unparseable date: "${row["Date"]}"`, raw: row });
        return;
      }

      if (isDeclinedGnosisRow(row)) {
        errors.push({
          row: rowNum,
          message: `Declined (${row["Reason"] || "no reason given"}) — not imported, no funds moved.`,
          raw: row,
        });
        return;
      }

      const rawAmount = Number(row["Amount (EUR)"]);
      if (!Number.isFinite(rawAmount)) {
        errors.push({ row: rowNum, message: `Unparseable Amount (EUR): "${row["Amount (EUR)"]}"`, raw: row });
        return;
      }
      if (!row["Transaction ID"]) {
        errors.push({ row: rowNum, message: "Missing Transaction ID", raw: row });
        return;
      }

      const amount = -rawAmount;
      const { type, needsReview, reviewReason } = classifyGnosisRow(row);
      const sourceId = row["Transaction ID"].trim();

      transactions.push({
        id: `gnosis:${sourceId}`,
        date: row["Date"],
        provider: "gnosis",
        merchant: row["Merchant"].trim(),
        amount,
        currency: "EUR",
        type,
        category: "uncategorized", // no MCC/category column
        sourceId,
        needsReview,
        reviewReason,
        raw: row,
      });
    });

    return { transactions, errors };
  },
};
