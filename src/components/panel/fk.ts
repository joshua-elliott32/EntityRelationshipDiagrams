import {
  findTable,
  primaryKeyColumns,
  singular,
  type Column,
  type ColumnRef,
  type Diagram,
  type Table,
} from "@/lib/model";

/** The column a new foreign key to `parent` should point at: its (first) primary key. */
export function defaultRefColumn(parent: Table | undefined): string {
  if (!parent) return "";
  return primaryKeyColumns(parent)[0]?.id ?? "";
}

/**
 * Guess what a column references from its name: `customer_id` → customers
 * (by table name or by the parent's key name), `parent_id` → the same table.
 * Returns null when nothing matches, so the user picks.
 */
export function guessReference(d: Diagram, tableId: string, col: Column): ColumnRef | null {
  const raw = col.name.trim();
  const name = raw.toLowerCase();
  if (!name) return null;
  const others = d.tables.filter((t) => t.id !== tableId);

  // A table whose key has exactly this name (customers.customer_id).
  const byKey =
    name === "id"
      ? undefined
      : others.find((t) => primaryKeyColumns(t).some((c) => c.name.trim().toLowerCase() === name));
  if (byKey) {
    const pk = primaryKeyColumns(byKey).find((c) => c.name.trim().toLowerCase() === name)!;
    return { tableId: byKey.id, columnId: pk.id };
  }

  // customer_id, customer_key, customerId, CustomerID…
  const m = /^(.+?)_(?:id|key|code|no|ref)$/.exec(name) ?? /^(.*[a-z])(?:Id|ID)$/.exec(raw);
  const base = m ? m[1].toLowerCase() : "";
  if (!base) return null;
  if (base === "parent") {
    const self = findTable(d, tableId);
    return self ? { tableId, columnId: defaultRefColumn(self) } : null;
  }
  const byName = others.find((t) => {
    const n = t.name.trim().toLowerCase();
    return n === base || singular(n) === base || singular(n) === singular(base);
  });
  return byName ? { tableId: byName.id, columnId: defaultRefColumn(byName) } : null;
}
