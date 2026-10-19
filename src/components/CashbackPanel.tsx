import { formatAmount, formatCurrencyAmounts } from "@/lib/format";
import type { CurrencyAmounts } from "@/lib/cashback";
import type { Provider } from "@/lib/schema";

const PROVIDER_LABELS: Record<Provider, string> = { etherfi: "EtherFi", plasma: "Plasma", gnosis: "Gnosis" };

// 2 fixed stats (Cashback Earned, Effective Rate) + one per provider. Literal
// classes so Tailwind's scanner picks them up (a computed class string won't).
const GRID_COLS: Record<number, string> = {
  1: "sm:grid-cols-3",
  2: "sm:grid-cols-4",
  3: "sm:grid-cols-5",
};

interface Props {
  totalUsd: number;
  unconverted: CurrencyAmounts; // cashback in a currency that couldn't be converted to USD
  rateUsd: number | null;
  byProvider: Record<Provider, CurrencyAmounts>;
  providers: Provider[];
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-lg text-neutral-100">{value}</div>
    </div>
  );
}

export function CashbackPanel({ totalUsd, unconverted, rateUsd, byProvider, providers }: Props) {
  const unconvertedSuffix = Object.keys(unconverted).length > 0 ? ` + ${formatCurrencyAmounts(unconverted)}` : "";
  const gridCols = GRID_COLS[providers.length] ?? "sm:grid-cols-4";

  return (
    <div className={`border border-neutral-700 p-3 grid grid-cols-2 ${gridCols} gap-4`}>
      <Stat label="Cashback Earned" value={`${formatAmount(totalUsd, "USD")}${unconvertedSuffix}`} />
      <Stat label="Effective Rate" value={rateUsd !== null ? `${rateUsd.toFixed(2)}%` : "—"} />
      {providers.map((p) => (
        <Stat key={p} label={PROVIDER_LABELS[p]} value={formatCurrencyAmounts(byProvider[p] ?? {})} />
      ))}
    </div>
  );
}
