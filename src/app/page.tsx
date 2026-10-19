"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UploadForm } from "@/components/UploadForm";
import { FiltersBar } from "@/components/Filters";
import { SummaryPanel } from "@/components/SummaryPanel";
import { Breakdowns } from "@/components/Breakdowns";
import { TransactionTable } from "@/components/TransactionTable";
import { applyCategoryToMerchant, getAllTransactions, markReviewed, setTransactionCategory } from "@/lib/db";
import { monthKey } from "@/lib/format";
import { getEurUsdRate, type FxRate } from "@/lib/fx";
import { normalizeMerchantKey } from "@/lib/merchants";
import { categoryBreakdown, filterTransactions, isCardActivity, monthlyTrend, summarize, type Filters } from "@/lib/spending";
import type { Provider, Transaction } from "@/lib/schema";

const PROVIDER_ORDER: Provider[] = ["etherfi", "plasma", "gnosis"];

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [reviewOnly, setReviewOnly] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [fx, setFx] = useState<FxRate | null>(null);

  const refresh = useCallback(() => {
    getAllTransactions().then(setTransactions);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    getEurUsdRate().then(setFx);
  }, []);

  const months = useMemo(
    () => [...new Set(transactions.map((t) => monthKey(t.date)))].sort().reverse(),
    [transactions]
  );

  // Determined from all stored transactions, not the filtered view, so a
  // provider with zero matches for the current filter still stays visible.
  const availableProviders = useMemo(() => {
    const present = new Set(transactions.map((t) => t.provider));
    return PROVIDER_ORDER.filter((p) => present.has(p));
  }, [transactions]);

  const filtered = useMemo(() => {
    const byFilters = filterTransactions(transactions, filters).filter(isCardActivity);
    return reviewOnly ? byFilters.filter((t) => t.needsReview) : byFilters;
  }, [transactions, filters, reviewOnly]);

  const hasEurTransactions = useMemo(() => filtered.some((t) => t.currency === "EUR"), [filtered]);

  const summary = useMemo(() => summarize(filtered, fx), [filtered, fx]);
  const monthly = useMemo(() => monthlyTrend(filtered, fx), [filtered, fx]);
  const byCategory = useMemo(() => categoryBreakdown(filtered, fx), [filtered, fx]);
  const pendingReviewCount = useMemo(() => transactions.filter((t) => t.needsReview).length, [transactions]);

  async function handleCategoryChange(id: string, category: string) {
    await setTransactionCategory(id, category);
    refresh();
  }

  async function handleApplyToMerchant(merchant: string, category: string) {
    await applyCategoryToMerchant(normalizeMerchantKey(merchant), category, merchant);
    refresh();
  }

  async function handleMarkReviewed(id: string) {
    await markReviewed(id);
    refresh();
  }

  return (
    <main className="max-w-5xl mx-auto p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-100">where did my crypto go?</h1>
        <p className="text-sm text-neutral-500">Track your spending across multiple cards.</p>
      </div>
      <UploadForm onImported={refresh} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <FiltersBar months={months} providers={availableProviders} filters={filters} onChange={setFilters} />
        <div className="flex items-center gap-3">
          <label className="text-sm text-neutral-300 flex items-center gap-1">
            <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} />
            review flagged ({pendingReviewCount})
          </label>
        </div>
      </div>

      <SummaryPanel summary={summary} providers={availableProviders} fx={fx} hasEurTransactions={hasEurTransactions} />
      <Breakdowns monthly={monthly} byCategory={byCategory} />

      <button
        onClick={() => setShowTransactions((v) => !v)}
        className="self-start text-sm text-neutral-400 border border-neutral-700 px-2 py-1 hover:bg-neutral-800"
      >
        {showTransactions ? "[-] hide transactions" : `[+] show transactions (${filtered.length})`}
      </button>
      {showTransactions && (
        <TransactionTable
          transactions={filtered}
          onCategoryChange={handleCategoryChange}
          onApplyToMerchant={handleApplyToMerchant}
          onMarkReviewed={handleMarkReviewed}
        />
      )}
    </main>
  );
}
