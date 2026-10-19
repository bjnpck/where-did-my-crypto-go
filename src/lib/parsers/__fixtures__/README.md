# Fixtures needed

No real EtherFi or Plasma CSV exports were available while building this project, so
`etherfi.ts` and `plasma.ts` are stubs (they `detect() -> false` and `parse()` throws).

To implement them:

1. Drop a real export here as `etherfi.sample.csv` / `plasma.sample.csv` (redact amounts/merchants if needed, but keep the real column headers and a few representative rows: spend, refund, card funding, internal transfer).
2. Fill in `detect()` to match that header.
3. Fill in `parse()` to map columns to the `Transaction` schema (`src/lib/schema.ts`). Any field that can't be mapped unambiguously should set `needsReview: true` and `reviewReason`, not a guess.
4. Add fixture-driven tests in `__tests__/` alongside `etherfi.sample.csv`/`plasma.sample.csv`.
