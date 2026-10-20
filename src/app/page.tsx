"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UploadForm } from "@/components/UploadForm";
import { ClearAllButton } from "@/components/ClearAllButton";
import { FiltersBar } from "@/components/Filters";
import { SummaryPanel } from "@/components/SummaryPanel";
import { Breakdowns } from "@/components/Breakdowns";
import { TransactionTable } from "@/components/TransactionTable";
import { Faq } from "@/components/Faq";
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

  const isEmpty = transactions.length === 0;

  return (
    <main className="max-w-5xl mx-auto p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-neutral-100">where did my crypto go?</h1>
        <p className="text-sm text-neutral-500">Private expense tracker for multiple cards.</p>
      </div>
      <UploadForm onImported={refresh} />

      {!isEmpty && (
        <>
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowTransactions((v) => !v)}
              className="text-sm text-neutral-400 border border-neutral-700 px-2 py-1 hover:bg-neutral-800"
            >
              {showTransactions ? "[-] hide transactions" : `[+] show transactions (${filtered.length})`}
            </button>
            <ClearAllButton onCleared={refresh} />
          </div>
          {showTransactions && (
            <TransactionTable
              transactions={filtered}
              onCategoryChange={handleCategoryChange}
              onApplyToMerchant={handleApplyToMerchant}
              onMarkReviewed={handleMarkReviewed}
            />
          )}
        </>
      )}

      <Faq />

      <footer className="flex items-center justify-end gap-2 text-xs text-neutral-500">
        built by{" "}
        <a href="https://x.com/bjnpck" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-300">
          bjnpck
        </a>
        <a
          href="https://github.com/bjnpck/where-did-my-crypto-go"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          className="hover:text-neutral-300"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
        </a>
      </footer>
    </main>
  );
}
