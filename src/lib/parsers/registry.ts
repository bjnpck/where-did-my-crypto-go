import { parseCsv } from "../csv";
import { etherfiParser } from "./etherfi";
import { gnosisParser } from "./gnosis";
import { plasmaParser } from "./plasma";
import type { ProviderParser } from "./types";

export const parsers: ProviderParser[] = [etherfiParser, plasmaParser, gnosisParser];

/** Picks the parser whose `detect` matches the CSV's header row. */
export function detectParser(csvText: string): ProviderParser | null {
  const header = parseCsv(csvText)[0] ?? [];
  return parsers.find((p) => p.detect(header)) ?? null;
}
