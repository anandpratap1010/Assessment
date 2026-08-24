import { createHash } from 'node:crypto';
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  return value;
}
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
export function createRequestHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
