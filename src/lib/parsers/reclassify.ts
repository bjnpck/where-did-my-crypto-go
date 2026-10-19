import type { Transaction } from "../schema";
import { classifyEtherfiRow, extractEtherfiCashback } from "./etherfi";
import { classifyGnosisRow } from "./gnosis";
import { classifyPlasmaRow } from "./plasma";

function classifyRow(t: Transaction) {
  if (t.provider === "etherfi") return classifyEtherfiRow(t.raw);
  if (t.provider === "gnosis") return classifyGnosisRow(t.raw);
  return classifyPlasmaRow(t.raw, t.amount);
}

/**
 * Re-derives `type` (and, unless a human already resolved the review flag
 * manually, `needsReview`/`reviewReason`) plus EtherFi's `cashbackEarned`/
 * `cashbackCurrency` from the stored `raw` row using the current
 * classification rules. Used to bring transactions imported under older
 * rules up to date without re-importing the CSV. Leaves every other field
 * untouched.
 *
 * `reviewResolvedManually` exists so a human clearing a still-genuinely-
 * ambiguous flag (e.g. an unrecognized type) sticks — otherwise this
 * function would immediately re-flag it on the next read.
 */
export function reclassify(t: Transaction): Transaction {
  const result = classifyRow(t);
  const cashback = t.provider === "etherfi" ? extractEtherfiCashback(t.raw) : {};

  const needsReview = t.reviewResolvedManually ? false : result.needsReview;
  const reviewReason = t.reviewResolvedManually ? t.reviewReason : result.reviewReason;

  if (
    result.type === t.type &&
    needsReview === t.needsReview &&
    reviewReason === t.reviewReason &&
    cashback.cashbackEarned === t.cashbackEarned &&
    cashback.cashbackCurrency === t.cashbackCurrency
  ) {
    return t;
  }
  return { ...t, type: result.type, needsReview, reviewReason, ...cashback };
}
