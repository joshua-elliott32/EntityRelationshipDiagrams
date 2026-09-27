import {
  findColumn,
  findTable,
  primaryKeyColumns,
  type Column,
  type Diagram,
  type ReferentialAction,
  type Relationship,
  type Table,
} from "@/lib/model";

/**
 * Foreign keys as the exporters need them: relationships resolved to real
 * columns, with several single-column relationships that together cover a
 * parent's composite primary key merged into one composite key.
 */
export interface ForeignKey {
  /** `fk_<child>_<col>[_<col>…]`, unique within the diagram. */
  name: string;
  child: Table;
  parent: Table;
  childCols: Column[];
  parentCols: Column[];
  rels: Relationship[];
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
  /** Any of the relationships is 1:1. */
  oneToOne: boolean;
}

export type UnresolvedReason = "no-child-column" | "no-parent-column";

export interface ResolvedKeys {
  fks: ForeignKey[];
  /** N:M relationships: they need a junction table, not a foreign key. */
  manyToMany: Relationship[];
  /** 1:1 / 1:N relationships that can't become a constraint yet. */
  unresolved: { rel: Relationship; reason: UnresolvedReason }[];
}

/** A lower-case identifier fragment safe to use unquoted: `Order Items` → `order_items`. */
export function identFragment(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "x"
  );
}

interface Pair {
  rel: Relationship;
  index: number;
  childCol: Column;
  parentCol: Column;
}

export function resolveForeignKeys(d: Diagram): ResolvedKeys {
  const manyToMany: Relationship[] = [];
  const unresolved: ResolvedKeys["unresolved"] = [];
  // child table id → parent table id → pairs, both in first-seen order.
  const byChild = new Map<string, Map<string, Pair[]>>();

  d.rels.forEach((rel, index) => {
    const parent = findTable(d, rel.from);
    const child = findTable(d, rel.to);
    if (!parent || !child) return;
    if (rel.type === "N:M") {
      manyToMany.push(rel);
      return;
    }
    const childCol = findColumn(child, rel.toCol);
    if (!childCol) {
      unresolved.push({ rel, reason: "no-child-column" });
      return;
    }
    let parentCol = findColumn(parent, rel.fromCol);
    if (!parentCol) {
      const pk = primaryKeyColumns(parent);
      if (pk.length === 1) parentCol = pk[0];
    }
    if (!parentCol) {
      unresolved.push({ rel, reason: "no-parent-column" });
      return;
    }
    let parents = byChild.get(child.id);
    if (!parents) byChild.set(child.id, (parents = new Map()));
    const list = parents.get(parent.id) ?? [];
    list.push({ rel, index, childCol, parentCol });
    parents.set(parent.id, list);
  });

  const groups: { pairs: Pair[]; child: Table; parent: Table }[] = [];
  for (const [childId, parents] of byChild) {
    const child = findTable(d, childId)!;
    for (const [parentId, pairs] of parents) {
      const parent = findTable(d, parentId)!;
      let remaining = pairs;
      const pk = primaryKeyColumns(parent);
      if (pk.length >= 2) {
        for (;;) {
          const chosen = new Map<string, Pair>();
          const usedChild = new Set<string>();
          for (const p of remaining) {
            if (!pk.includes(p.parentCol) || chosen.has(p.parentCol.id)) continue;
            if (usedChild.has(p.childCol.id)) continue;
            chosen.set(p.parentCol.id, p);
            usedChild.add(p.childCol.id);
          }
          if (chosen.size !== pk.length) break;
          groups.push({ pairs: pk.map((c) => chosen.get(c.id)!), child, parent });
          const taken = new Set(chosen.values());
          remaining = remaining.filter((p) => !taken.has(p));
        }
      }
      for (const p of remaining) groups.push({ pairs: [p], child, parent });
    }
  }

  const tableIndex = new Map(d.tables.map((t, i) => [t.id, i]));
  groups.sort(
    (a, b) =>
      tableIndex.get(a.child.id)! - tableIndex.get(b.child.id)! ||
      Math.min(...a.pairs.map((p) => p.index)) - Math.min(...b.pairs.map((p) => p.index)),
  );

  const usedNames = new Set<string>();
  const fks = groups.map(({ pairs, child, parent }): ForeignKey => {
    const base = `fk_${identFragment(child.name)}_${pairs.map((p) => identFragment(p.childCol.name)).join("_")}`;
    let name = base;
    for (let n = 2; usedNames.has(name); n++) name = `${base}_${n}`;
    usedNames.add(name);
    // Actions come from the relationship drawn first.
    const first = pairs.reduce((a, b) => (b.index < a.index ? b : a)).rel;
    return {
      name,
      child,
      parent,
      childCols: pairs.map((p) => p.childCol),
      parentCols: pairs.map((p) => p.parentCol),
      rels: pairs.map((p) => p.rel),
      onDelete: first.onDelete,
      onUpdate: first.onUpdate,
      oneToOne: pairs.some((p) => p.rel.type === "1:1"),
    };
  });

  return { fks, manyToMany, unresolved };
}

/**
 * Order tables so parents come before children. When tables reference each
 * other in a cycle, the earliest remaining table (in diagram order) goes next;
 * foreign keys that then point "forwards" are returned as `deferred`.
 */
export function dependencyOrder(
  d: Diagram,
  fks: ForeignKey[],
): { order: Table[]; deferred: ForeignKey[]; cyclic: Table[] } {
  const parentsOf = new Map<string, Set<string>>();
  for (const fk of fks) {
    if (fk.child.id === fk.parent.id) continue;
    let s = parentsOf.get(fk.child.id);
    if (!s) parentsOf.set(fk.child.id, (s = new Set()));
    s.add(fk.parent.id);
  }
  const done = new Set<string>();
  const order: Table[] = [];
  const cyclic = new Set<Table>();
  const remaining = [...d.tables];
  while (remaining.length) {
    let i = remaining.findIndex((t) => [...(parentsOf.get(t.id) ?? [])].every((p) => done.has(p)));
    if (i < 0) {
      i = 0;
      for (const t of remaining) cyclic.add(t);
    }
    const [t] = remaining.splice(i, 1);
    done.add(t.id);
    order.push(t);
  }
  const pos = new Map(order.map((t, i) => [t.id, i]));
  const deferred = fks.filter((fk) => pos.get(fk.parent.id)! > pos.get(fk.child.id)!);
  // Only report tables that actually take part in a deferred key.
  const inCycle = new Set<string>();
  for (const fk of deferred) {
    inCycle.add(fk.child.id);
    inCycle.add(fk.parent.id);
  }
  return {
    order,
    deferred,
    cyclic: order.filter((t) => cyclic.has(t) && inCycle.has(t.id)),
  };
}
