import type { StateValue } from "../ast/types";

/**
 * Deterministic canonical serialization for any StateValue.
 * Ensures that `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce the exact same hash key.
 */
export function canonicalHash(value: StateValue): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && Object.is(value, -0)) {
      return "0";
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalHash).join(",")}]`;
  }

  const obj = value as Record<string, StateValue>;
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map(
    (k) => `${JSON.stringify(k)}:${canonicalHash(obj[k])}`
  );
  return `{${entries.join(",")}}`;
}

/** Structural deep equality based on canonical representation. */
export function deepEqual(a: StateValue, b: StateValue): boolean {
  return canonicalHash(a) === canonicalHash(b);
}

/** Deduplicates and canonically orders elements to represent a finite mathematical set. */
export function normalizeSet(elements: readonly StateValue[]): readonly StateValue[] {
  const byHash = new Map<string, StateValue>();
  for (const el of elements) {
    const h = canonicalHash(el);
    if (!byHash.has(h)) {
      byHash.set(h, el);
    }
  }
  const sortedEntries = [...byHash.entries()].sort(([ha], [hb]) =>
    ha < hb ? -1 : ha > hb ? 1 : 0
  );
  return Object.freeze(sortedEntries.map(([, val]) => val));
}
