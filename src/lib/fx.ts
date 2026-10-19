/** Totals keyed by currency — never summed across currencies without going through sumToUsd(). */
export type CurrencyAmounts = Record<string, number>;

// ECB's free, no-key Data API. We ask for the latest daily USD/EUR reference
// rate at or before yesterday (never today's, which may not be published
// yet, or move intraday) — see getEurUsdRate(). No transaction data is ever
// sent; this is a plain GET with no query params derived from user data.
const ECB_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A";
const CACHE_KEY = "fx:eurusd";

export interface FxRate {
  rate: number; // USD per 1 EUR
  date: string; // "YYYY-MM-DD", the ECB reference date the rate applies to
  fetchedAt: number; // epoch ms, when this rate was fetched
  stale?: boolean; // true when a fresh fetch failed and this is a cached fallback
}

function readCache(): FxRate | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as FxRate) : null;
  } catch {
    return null;
  }
}

function writeCache(rate: FxRate) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(rate));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — fetch again next time.
  }
}

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayLocal(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function fetchLatestRate(): Promise<FxRate> {
  const url = `${ECB_URL}?endPeriod=${yesterdayLocal()}&lastNObservations=1&format=jsondata`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ECB request failed: ${res.status}`);
  const data = await res.json();

  const series = data?.dataSets?.[0]?.series?.["0:0:0:0:0"];
  const obsKeys = series ? Object.keys(series.observations) : [];
  if (!series || obsKeys.length === 0) throw new Error("No observation in ECB response");

  const obsIndex = obsKeys[obsKeys.length - 1];
  const rate = series.observations[obsIndex]?.[0];
  const timeValues = data?.structure?.dimensions?.observation?.find(
    (d: { id: string }) => d.id === "TIME_PERIOD"
  )?.values;
  const date = timeValues?.[Number(obsIndex)]?.id;

  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) throw new Error("Invalid rate in ECB response");
  if (typeof date !== "string") throw new Error("Missing reference date in ECB response");

  return { rate, date, fetchedAt: Date.now() };
}

/**
 * The EUR/USD rate to use for combining Gnosis's EUR amounts into the USD
 * dashboard totals. Fetches at most once per local calendar day (cached in
 * localStorage); a cached rate is reused for the rest of the day without a
 * network call. On fetch failure, falls back to the last cached rate marked
 * `stale: true`; if there's no cache at all, returns null so callers keep
 * currencies separate instead of inventing a rate.
 */
export async function getEurUsdRate(): Promise<FxRate | null> {
  const cached = readCache();
  if (cached && !cached.stale && new Date(cached.fetchedAt).toISOString().slice(0, 10) === todayLocal()) {
    return cached;
  }

  try {
    const fresh = await fetchLatestRate();
    writeCache(fresh);
    return fresh;
  } catch {
    return cached ? { ...cached, stale: true } : null;
  }
}

/** Converts one amount to USD. USD passes through unchanged (no rate needed); EUR needs a rate; anything else is never guessed. */
export function convertToUsd(amount: number, currency: string, fx: FxRate | null): number | null {
  if (currency === "USD") return amount;
  if (currency === "EUR" && fx) return amount * fx.rate;
  return null;
}

/**
 * Combines a currency-keyed totals map into a single USD number, keeping
 * whatever couldn't be converted (no rate available) in `unconverted`
 * instead of silently dropping or mis-summing it.
 */
export function sumToUsd(amounts: CurrencyAmounts, fx: FxRate | null): { usd: number; unconverted: CurrencyAmounts } {
  let usd = 0;
  const unconverted: CurrencyAmounts = {};
  for (const [currency, amount] of Object.entries(amounts)) {
    const converted = convertToUsd(amount, currency, fx);
    if (converted === null) unconverted[currency] = amount;
    else usd += converted;
  }
  return { usd, unconverted };
}
