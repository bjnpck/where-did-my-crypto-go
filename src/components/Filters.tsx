import { SIMPLIFIED_CATEGORIES } from "@/lib/categories";
import type { Filters } from "@/lib/spending";
import type { Provider } from "@/lib/schema";

interface Props {
  months: string[]; // "YYYY-MM", sorted descending
  providers: Provider[]; // providers actually present in storage
  filters: Filters;
  onChange: (filters: Filters) => void;
}

const selectClass = "bg-neutral-900 border border-neutral-700 text-neutral-200 text-sm px-2 py-1";

export function FiltersBar({ months, providers, filters, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <select
        className={selectClass}
        value={filters.month ?? ""}
        onChange={(e) => onChange({ ...filters, month: e.target.value || undefined })}
      >
        <option value="">all months</option>
        {months.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <select
        className={selectClass}
        value={filters.provider ?? ""}
        onChange={(e) =>
          onChange({ ...filters, provider: (e.target.value || undefined) as Provider | undefined })
        }
      >
        <option value="">all providers</option>
        {providers.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <select
        className={selectClass}
        value={filters.category ?? ""}
        onChange={(e) => onChange({ ...filters, category: e.target.value || undefined })}
      >
        <option value="">all categories</option>
        {SIMPLIFIED_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
