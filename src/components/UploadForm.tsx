"use client";

import { useState } from "react";
import { detectParser } from "@/lib/parsers/registry";
import { clearAllData, importTransactions } from "@/lib/db";
import { evaluateParseResult } from "@/lib/importValidation";

interface Props {
  onImported: () => void;
}

export function UploadForm({ onImported }: Props) {
  const [status, setStatus] = useState<string | null>(null);

  async function handleFile(file: File) {
    const text = await file.text();
    const parser = detectParser(text);
    if (!parser) {
      setStatus(
        `Could not identify the provider for "${file.name}". No parser's detect() matched this CSV's header.`
      );
      return;
    }
    try {
      const result = parser.parse(text);
      const decision = evaluateParseResult(parser.label, result);
      if (!decision.accepted) {
        setStatus(decision.message!);
        return;
      }
      const { inserted, duplicates } = await importTransactions(result.transactions);
      const errorNote = result.errors.length ? ` ${result.errors.length} row(s) had errors.` : "";
      setStatus(
        `${parser.label}: imported ${inserted}, skipped ${duplicates} duplicate(s).${errorNote}`
      );
      onImported();
    } catch (err) {
      setStatus(`${parser.label}: ${(err as Error).message}`);
    }
  }

  async function handleClearAll() {
    const confirmed = window.confirm(
      "This will permanently delete all imported transactions and saved merchant/category rules. This cannot be undone. Continue?"
    );
    if (!confirmed) return;
    await clearAllData();
    setStatus("All data cleared.");
    onImported();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="text-sm text-neutral-300 file:mr-2 file:px-2 file:py-1 file:border file:border-neutral-600 file:bg-neutral-800 file:text-neutral-200"
        />
        <button
          onClick={handleClearAll}
          className="text-sm text-neutral-400 border border-neutral-700 px-2 py-1 hover:bg-neutral-800"
        >
          Clear all data
        </button>
      </div>
      {status && <p className="text-sm text-neutral-400">{status}</p>}
    </div>
  );
}
