// Normalized transaction schema shared by every provider parser.

export type Provider = "etherfi" | "plasma" | "gnosis";

export type TransactionType =
  | "spend"
  | "refund"
  | "funding"
  | "transfer"
  | "cashback"
  // Non-card account activity (DeFi/lending/referral operations some
  // providers report alongside card transactions). Never counted as
  // spending or cashback — see isCardActivity() in spending.ts.
  | "financial_operation"
  | "cashback_claim"
  | "reward"
  | "reward_payout"
  | "borrowing_reward"
  | "unknown"; // flagged for manual review — never guessed

export interface Transaction {
  /** Deterministic id: `${provider}:${sourceId}`. Used for dedup. */
  id: string;
  date: string; // ISO 8601 date or datetime, e.g. "2026-01-15" or "2026-01-15T10:06:59"
  provider: Provider;
  merchant: string;
  amount: number; // positive = money out, negative = money in, in `currency` units
  currency: string; // ISO 4217 or token symbol as given by the provider
  type: TransactionType;
  category: string; // original category as given by the provider; "uncategorized" if none
  categoryOverride?: string; // user-edited category; takes precedence over `category` for display
  categoryOverrideSource?: "manual" | "merchant-rule"; // "manual" edits are never clobbered by a later merchant-rule bulk apply
  sourceId: string; // raw id/reference from the provider's CSV, used for dedup
  needsReview: boolean; // true when any field above was ambiguous and not guessed
  reviewReason?: string;
  reviewResolvedManually?: boolean; // true once a human clears a still-ambiguous flag; stops reclassify() from re-flagging it
  raw: Record<string, string>; // original CSV row, for audit/debugging

  // EtherFi records a reward earned *on* each spend row, rather than as its
  // own transaction (unlike Plasma's "Card cashback", which is a separate
  // type="cashback" row). Set only when the source gives a real, positive
  // value — never estimated.
  cashbackEarned?: number;
  cashbackCurrency?: string;
}

/** Result of parsing one CSV file. */
export interface ParseResult {
  transactions: Transaction[];
  errors: ParseError[];
}

export interface ParseError {
  row: number; // 1-based, header excluded
  message: string;
  raw?: Record<string, string>;
}
