import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvWithHeader } from "../src/lib/csv";

describe("parseCsv", () => {
  it("splits plain rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with embedded commas and escaped quotes", () => {
    const text = 'date,merchant\n2026-01-01,"Acme, Inc. ""Store"""';
    expect(parseCsv(text)).toEqual([
      ["date", "merchant"],
      ["2026-01-01", 'Acme, Inc. "Store"'],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvWithHeader", () => {
  it("maps rows to objects keyed by header", () => {
    const rows = parseCsvWithHeader("date,amount\n2026-01-01,10.50");
    expect(rows).toEqual([{ date: "2026-01-01", amount: "10.50" }]);
  });

  it("returns [] for empty input", () => {
    expect(parseCsvWithHeader("")).toEqual([]);
  });
});
