import { describe, expect, it } from "vitest";
import { evaluateParseResult } from "../src/lib/importValidation";
import type { Transaction } from "../src/lib/schema";

function tx(): Transaction {
  return {
    id: "etherfi:1",
    date: "2026-01-15",
    provider: "etherfi",
    merchant: "Market",
    amount: 10,
    currency: "USD",
    type: "spend",
    category: "uncategorized",
    sourceId: "1",
    needsReview: false,
    raw: {},
  };
}

describe("evaluateParseResult", () => {
  it("rejects a file where every row failed to parse", () => {
    const decision = evaluateParseResult("EtherFi", {
      transactions: [],
      errors: [{ row: 1, message: "bad" }, { row: 2, message: "bad" }],
    });
    expect(decision.accepted).toBe(false);
    expect(decision.message).toMatch(/doesn't look like a valid EtherFi export/);
    expect(decision.message).toMatch(/2 row/);
  });

  it("accepts a file with at least one valid row, even if some rows errored", () => {
    const decision = evaluateParseResult("EtherFi", {
      transactions: [tx()],
      errors: [{ row: 2, message: "bad" }],
    });
    expect(decision.accepted).toBe(true);
    expect(decision.message).toBeUndefined();
  });

  it("accepts a structurally valid file with zero data rows (not a wrong file, just empty)", () => {
    const decision = evaluateParseResult("EtherFi", { transactions: [], errors: [] });
    expect(decision.accepted).toBe(true);
  });
});
