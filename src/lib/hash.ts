// Deterministic short hash for building dedup keys when a provider gives no transaction id.
// ponytail: FNV-1a, not cryptographic — fine for a dedup key, not a security boundary.
export function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
