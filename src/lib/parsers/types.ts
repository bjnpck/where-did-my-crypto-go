import type { ParseResult, Provider } from "../schema";

export interface ProviderParser {
  provider: Provider;
  label: string;
  /** Returns true if this CSV's header looks like this provider's export. */
  detect(header: string[]): boolean;
  parse(csvText: string): ParseResult;
}
