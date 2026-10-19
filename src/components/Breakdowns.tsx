import { formatAmount } from "@/lib/format";
import type { BreakdownEntry } from "@/lib/spending";

function BarList({ entries }: { entries: BreakdownEntry[] }) {
  const max = Math.max(1, ...entries.map((e) => Math.abs(e.total)));
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {entries.map((e) => (
        <li key={e.key} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-neutral-400" title={e.key}>
            {e.key}
          </span>
          <span className="flex-1 bg-neutral-800 h-3">
            <span
              className="block h-3 bg-neutral-500"
              style={{ width: `${(Math.abs(e.total) / max) * 100}%` }}
            />
          </span>
          <span className="w-20 shrink-0 text-right text-neutral-200">
            {formatAmount(e.total, "USD")}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Breakdowns({
  monthly,
  byCategory,
}: {
  monthly: BreakdownEntry[];
  byCategory: BreakdownEntry[];
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div>
        <h2 className="text-xs uppercase text-neutral-500 mb-1">monthly</h2>
        {monthly.length ? <BarList entries={monthly} /> : <p className="text-sm text-neutral-500">—</p>}
      </div>
      <div>
        <h2 className="text-xs uppercase text-neutral-500 mb-1">category</h2>
        {byCategory.length ? (
          <BarList entries={byCategory} />
        ) : (
          <p className="text-sm text-neutral-500">—</p>
        )}
      </div>
    </div>
  );
}
