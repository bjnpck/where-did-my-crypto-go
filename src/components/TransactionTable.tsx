import { SIMPLIFIED_CATEGORIES, displayCategory } from "@/lib/categories";
import { formatAmount, formatDate } from "@/lib/format";
import { displayMerchantName } from "@/lib/merchants";
import type { Transaction } from "@/lib/schema";

interface Props {
  transactions: Transaction[];
  onCategoryChange: (id: string, category: string) => void;
  onApplyToMerchant: (merchant: string, category: string) => void;
  onMarkReviewed: (id: string) => void;
}

export function TransactionTable({
  transactions,
  onCategoryChange,
  onApplyToMerchant,
  onMarkReviewed,
}: Props) {
  if (transactions.length === 0) {
    return <p className="text-sm text-neutral-500">no transactions imported yet</p>;
  }

  const hasFlagged = transactions.some((t) => t.needsReview);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="text-left border-b border-neutral-700 text-neutral-400">
            <th className="py-1 pr-3">date</th>
            <th className="py-1 pr-3">provider</th>
            <th className="py-1 pr-3">merchant</th>
            <th className="py-1 pr-3 text-right">amount</th>
            <th className="py-1 pr-3">type</th>
            <th className="py-1 pr-3">category</th>
            {hasFlagged && <th className="py-1 pr-3">review</th>}
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => {
            const category = displayCategory(t);
            const merchantName = displayMerchantName(t.merchant);
            return (
              <tr key={t.id} className={`border-b border-neutral-800 ${t.needsReview ? "bg-neutral-800" : ""}`}>
                <td className="py-1 pr-3 text-neutral-300">{formatDate(t.date)}</td>
                <td className="py-1 pr-3 text-neutral-300">{t.provider}</td>
                <td
                  className="py-1 pr-3 text-neutral-300 max-w-xs truncate"
                  title={merchantName !== t.merchant ? t.merchant : undefined}
                >
                  {merchantName}
                </td>
                <td className="py-1 pr-3 text-right text-neutral-300">{formatAmount(t.amount, t.currency)}</td>
                <td className="py-1 pr-3 text-neutral-300">{t.type}</td>
                <td className="py-1 pr-3">
                  <div className="flex items-center gap-1">
                    <select
                      className="bg-neutral-900 border border-neutral-700 text-neutral-200 px-1 py-0.5"
                      value={category}
                      onChange={(e) => onCategoryChange(t.id, e.target.value)}
                    >
                      {SIMPLIFIED_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <button
                      title={`Apply "${category}" to every transaction from this merchant, now and on future imports`}
                      onClick={() => onApplyToMerchant(t.merchant, category)}
                      className="border border-neutral-600 px-1 py-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
                    >
                      [all]
                    </button>
                  </div>
                </td>
                {hasFlagged && (
                  <td className="py-1 pr-3">
                    {t.needsReview ? (
                      <button
                        title={t.reviewReason}
                        onClick={() => onMarkReviewed(t.id)}
                        className="border border-neutral-600 px-1.5 py-0.5 text-neutral-100 hover:bg-neutral-700"
                      >
                        [resolve]
                      </button>
                    ) : (
                      <span className="text-neutral-600">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
