import { formatAmount, formatCurrencyAmounts } from "@/lib/format";
import type { FxRate } from "@/lib/fx";
import type { Summary } from "@/lib/spending";
import type { Provider } from "@/lib/schema";

const PROVIDER_LABELS: Record<Provider, string> = { etherfi: "EtherFi", plasma: "Plasma", gnosis: "Gnosis" };

// 2 fixed stats (Total Spending, Transactions) + one per provider. Literal
// classes so Tailwind's scanner picks them up (a computed class string won't).
const GRID_COLS: Record<number, string> = {
  1: "sm:grid-cols-3",
  2: "sm:grid-cols-4",
  3: "sm:grid-cols-5",
};

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div title={title}>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-lg text-neutral-100">{value}</div>
    </div>
  );
}

export function SummaryPanel({
  summary,
  providers,
  fx,
  hasEurTransactions,
}: {
  summary: Summary;
  providers: Provider[];
  fx: FxRate | null;
  hasEurTransactions: boolean;
}) {
  const unconvertedSuffix =
    Object.keys(summary.unconverted).length > 0 ? ` + ${formatCurrencyAmounts(summary.unconverted)}` : "";

  const gridCols = GRID_COLS[providers.length] ?? "sm:grid-cols-4";

  const fxTooltip = !hasEurTransactions
    ? undefined
    : fx
      ? `1 EUR = ${fx.rate.toFixed(4)} USD (ECB reference, ${fx.date})${fx.stale ? " — stale, last refreshed rate" : ""}`
      : "EUR/USD rate unavailable — Gnosis EUR amounts aren't combined into USD totals.";

  return (
    <div className={`border border-neutral-700 p-3 grid grid-cols-2 ${gridCols} gap-4`}>
      <Stat label="Total Spending" value={`${formatAmount(summary.total, "USD")}${unconvertedSuffix}`} title={fxTooltip} />
      <Stat label="Transactions" value={String(summary.count)} />
      {providers.map((p) => (
        <Stat key={p} label={PROVIDER_LABELS[p]} value={formatAmount(summary.byProvider[p] ?? 0, "USD")} />
      ))}
    </div>
  );
}
