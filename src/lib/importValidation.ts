import type { ParseResult } from "./schema";

export interface ImportDecision {
  accepted: boolean;
  message?: string; // set when accepted is false — nothing was imported
}

/**
 * Rejects a file where not a single row could be parsed — a wrong or
 * corrupt provider export, not an otherwise-valid one with a handful of
 * ambiguous rows (that's the existing "flag for review" path, unaffected).
 * Returning `accepted: false` means the caller never calls
 * importTransactions(), so existing data is left untouched.
 */
export function evaluateParseResult(label: string, result: ParseResult): ImportDecision {
  if (result.transactions.length === 0 && result.errors.length > 0) {
    return {
      accepted: false,
      message: `This doesn't look like a valid ${label} export — none of its ${result.errors.length} row(s) could be parsed. No changes were made.`,
    };
  }
  return { accepted: true };
}
