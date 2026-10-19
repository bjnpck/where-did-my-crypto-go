import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convertToUsd, getEurUsdRate, sumToUsd } from "../src/lib/fx";

function ecbResponse(rate: number, date: string) {
  return {
    dataSets: [{ series: { "0:0:0:0:0": { observations: { "0": [rate] } } } }],
    structure: { dimensions: { observation: [{ id: "TIME_PERIOD", values: [{ id: date }] }] } },
  };
}

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

describe("convertToUsd", () => {
  it("passes USD through unchanged, without needing a rate", () => {
    expect(convertToUsd(42, "USD", null)).toBe(42);
  });

  it("converts EUR using the given rate", () => {
    expect(convertToUsd(10, "EUR", { rate: 1.1, date: "2026-10-16", fetchedAt: 0 })).toBeCloseTo(11);
  });

  it("never guesses a rate for EUR when none is available", () => {
    expect(convertToUsd(10, "EUR", null)).toBeNull();
  });

  it("never converts an unrecognized currency", () => {
    expect(convertToUsd(10, "GNO", { rate: 1.1, date: "2026-10-16", fetchedAt: 0 })).toBeNull();
  });
});

describe("sumToUsd", () => {
  it("combines convertible currencies into one USD total", () => {
    const fx = { rate: 1.1, date: "2026-10-16", fetchedAt: 0 };
    const { usd, unconverted } = sumToUsd({ USD: 100, EUR: 10 }, fx);
    expect(usd).toBeCloseTo(111);
    expect(unconverted).toEqual({});
  });

  it("keeps an unconvertible currency separate instead of mixing it in", () => {
    const { usd, unconverted } = sumToUsd({ USD: 100, EUR: 10 }, null);
    expect(usd).toBe(100);
    expect(unconverted).toEqual({ EUR: 10 });
  });
});

describe("getEurUsdRate", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches and caches a fresh rate when nothing is cached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ecbResponse(1.0834, "2026-10-16") })
    );

    const fx = await getEurUsdRate();
    expect(fx).toEqual({ rate: 1.0834, date: "2026-10-16", fetchedAt: expect.any(Number) });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.getItem("fx:eurusd")!)).toMatchObject({ rate: 1.0834 });
  });

  it("reuses the cached rate instead of fetching again the same day", async () => {
    storage.setItem(
      "fx:eurusd",
      JSON.stringify({ rate: 1.08, date: "2026-10-16", fetchedAt: Date.now() })
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const fx = await getEurUsdRate();
    expect(fx).toMatchObject({ rate: 1.08 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to the last cached rate, marked stale, when the fetch fails", async () => {
    storage.setItem(
      "fx:eurusd",
      JSON.stringify({ rate: 1.07, date: "2026-10-10", fetchedAt: Date.now() - 2 * 24 * 60 * 60 * 1000 })
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const fx = await getEurUsdRate();
    expect(fx).toMatchObject({ rate: 1.07, date: "2026-10-10", stale: true });
  });

  it("never invents a rate — returns null when the fetch fails and nothing is cached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await getEurUsdRate()).toBeNull();
  });

  it("never invents a rate — returns null on a malformed ECB response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await getEurUsdRate()).toBeNull();
  });
});
