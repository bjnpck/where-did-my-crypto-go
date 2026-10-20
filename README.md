# where did my crypto go?

A privacy-first expense tracker that combines spending across multiple crypto debit cards into one dashboard. Everything runs in the browser — no backend, no accounts, no analytics, no financial data ever leaves your machine.

## Features (V1)

- CSV import for EtherFi, Plasma, and Gnosis (Rebind card statement) exports
- Each provider's rows are classified from their own real export format — ambiguous or unrecognized transaction types are never guessed, just flagged for review
- Strict per-file validation: a CSV that doesn't match a supported provider format (or whose rows are all unparseable) is rejected outright, with no partial import
- Duplicate detection on re-import, including across overlapping export date ranges
- Merchant categorization: provider-supplied MCC categories where available, a shared merchant dictionary otherwise, with manual per-transaction or per-merchant category overrides that persist and apply to future imports
- Spending summary, monthly trend, and category breakdown, with filters by month/provider/category
- Automatic EUR→USD conversion (via the ECB's free daily reference-rate API — only a public exchange rate is fetched, never transaction data) so Gnosis's EUR amounts combine into the same totals as EtherFi/Plasma's USD amounts, while the transaction list still shows original amounts/currencies
- "Clear all data" to wipe everything and start over
- All data stored locally in IndexedDB; nothing is ever sent to a server
- Monochrome, monospace terminal-style UI

## Tech Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- IndexedDB (via `idb`)
- Vitest for tests

## Principles

- Privacy first: financial data stays in the browser
- Simple: no unnecessary features
- Accurate: spending must reconcile with source statements
- Never guess: ambiguous data is flagged for review, not classified on a hunch

## License

Source available under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). Use, modification, and distribution are permitted for noncommercial purposes only; commercial use requires separate permission from the copyright holder.
