"use client";

import { clearAllData } from "@/lib/db";

interface Props {
  onCleared: () => void;
}

export function ClearAllButton({ onCleared }: Props) {
  async function handleClick() {
    const confirmed = window.confirm(
      "This will permanently delete all imported transactions and saved merchant/category rules. This cannot be undone. Continue?"
    );
    if (!confirmed) return;
    await clearAllData();
    onCleared();
  }

  return (
    <button
      onClick={handleClick}
      className="text-sm text-neutral-400 border border-neutral-700 px-2 py-1 hover:bg-neutral-800"
    >
      Clear all data
    </button>
  );
}
