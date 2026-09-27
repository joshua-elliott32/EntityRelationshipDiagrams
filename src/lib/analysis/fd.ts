/**
 * Functional-dependency helpers. A table is treated as a relation whose
 * attributes are its columns, addressed by index (0 … n-1) for speed.
 */
import type { Table } from "@/lib/model";

/** `lhs → rhs`, both as column indices. */
export interface FD {
  lhs: number[];
  rhs: number[];
}

/** A dependency the user declared with "Determined by": `lhs → col`. */
export interface DeclaredFD {
  lhs: number[];
  col: number;
}

export interface TableFDs {
  /** Number of columns. */
  n: number;
  /** Declared dependencies (unknown ids and self-references dropped). */
  declared: DeclaredFD[];
  /** Declared plus key dependencies (primary key → all, unique non-null → all). */
  all: FD[];
  /** Indices of primary-key columns, in column order. */
  pk: number[];
  /** Minimal keys, in discovery order (primary key first when it is minimal). */
  candidateKeys: number[][];
  /** Columns that belong to at least one candidate key. */
  prime: boolean[];
}

/** Every attribute reachable from `start` under `fds`. */
export function closure(n: number, fds: FD[], start: number[]): boolean[] {
  const inSet: boolean[] = new Array<boolean>(n).fill(false);
  for (const i of start) inSet[i] = true;
  const used: boolean[] = new Array<boolean>(fds.length).fill(false);
  let changed = true;
  while (changed) {
    changed = false;
    for (let f = 0; f < fds.length; f++) {
      if (used[f]) continue;
      const fd = fds[f];
      if (!fd.lhs.every((i) => inSet[i])) continue;
      used[f] = true;
      for (const i of fd.rhs) {
        if (!inSet[i]) {
          inSet[i] = true;
          changed = true;
        }
      }
    }
  }
  return inSet;
}

export function isSuperkey(n: number, fds: FD[], set: number[]): boolean {
  if (n === 0) return true;
  return closure(n, fds, set).every(Boolean);
}

/** Drop attributes (in column order) while the set stays a superkey. */
export function minimiseKey(n: number, fds: FD[], key: number[]): number[] {
  let k = [...new Set(key)].sort((a, b) => a - b);
  for (const a of [...k]) {
    const without = k.filter((x) => x !== a);
    if (without.length > 0 && isSuperkey(n, fds, without)) k = without;
  }
  return k;
}

const isSubset = (a: number[], b: number[]) => a.every((x) => b.includes(x));

/** Caps the key search so a pathological table can't stall the checker. */
const MAX_KEYS = 64;

/**
 * All candidate keys reachable from the seeds (Lucchesi–Osborn): for each
 * key K and dependency X → Y, X ∪ (K − Y) is a superkey; minimise it and add
 * it when no known key is contained in it. With no seeds, returns [].
 */
export function candidateKeys(n: number, fds: FD[], seeds: number[][]): number[][] {
  const keys: number[][] = [];
  const addIfNew = (superkey: number[]) => {
    if (keys.length >= MAX_KEYS) return;
    if (keys.some((k) => isSubset(k, superkey))) return;
    keys.push(minimiseKey(n, fds, superkey));
  };
  for (const s of seeds) if (s.length > 0 && isSuperkey(n, fds, s)) addIfNew(s);
  for (let i = 0; i < keys.length && keys.length < MAX_KEYS; i++) {
    for (const fd of fds) {
      const s = [...new Set([...fd.lhs, ...keys[i].filter((a) => !fd.rhs.includes(a))])];
      addIfNew(s);
    }
  }
  // A seed added early may contain a key found later; keep only minimal sets.
  return keys.filter(
    (k, i) => !keys.some((o, j) => j !== i && o.length < k.length && isSubset(o, k)),
  );
}

/** Builds the dependency model for one table. */
export function tableFDs(t: Table): TableFDs {
  const n = t.columns.length;
  const index = new Map<string, number>();
  t.columns.forEach((c, i) => {
    if (!index.has(c.id)) index.set(c.id, i);
  });
  const everything = t.columns.map((_, i) => i);

  const declared: DeclaredFD[] = [];
  t.columns.forEach((c, col) => {
    const lhs = [
      ...new Set(
        (c.determinedBy ?? [])
          .map((id) => index.get(id))
          .filter((i): i is number => i !== undefined && i !== col),
      ),
    ].sort((a, b) => a - b);
    if (lhs.length > 0) declared.push({ lhs, col });
  });

  const pk = everything.filter((i) => t.columns[i].pk);
  const uniqueCols = everything.filter((i) => t.columns[i].unique && !t.columns[i].nullable);

  const all: FD[] = declared.map((d) => ({ lhs: d.lhs, rhs: [d.col] }));
  if (pk.length > 0) all.push({ lhs: pk, rhs: everything });
  for (const u of uniqueCols) all.push({ lhs: [u], rhs: everything });

  const seeds: number[][] = [];
  if (pk.length > 0) seeds.push(pk);
  for (const u of uniqueCols) seeds.push([u]);
  for (const d of declared) seeds.push(d.lhs);

  const keys = candidateKeys(n, all, seeds);
  const prime: boolean[] = new Array<boolean>(n).fill(false);
  for (const k of keys) for (const i of k) prime[i] = true;

  return { n, declared, all, pk, candidateKeys: keys, prime };
}
