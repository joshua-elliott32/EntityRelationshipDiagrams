import type { Column, ColumnRef, Diagram, Relationship, Table } from "./types";

export function findTable(d: Diagram, id: string): Table | undefined {
  return d.tables.find((t) => t.id === id);
}

export function findColumn(t: Table | undefined, id: string): Column | undefined {
  return t?.columns.find((c) => c.id === id);
}

export function findRel(d: Diagram, id: string): Relationship | undefined {
  return d.rels.find((r) => r.id === id);
}

/** Relationships that make this column a foreign key (usually zero or one). */
export function fkRelsOf(d: Diagram, tableId: string, columnId: string): Relationship[] {
  return d.rels.filter((r) => r.to === tableId && r.toCol === columnId && r.type !== "N:M");
}

export function isForeignKey(d: Diagram, tableId: string, columnId: string): boolean {
  return fkRelsOf(d, tableId, columnId).length > 0;
}

/** What this foreign-key column references, or null if it isn't one. */
export function foreignKeyOf(d: Diagram, tableId: string, columnId: string): ColumnRef | null {
  const r = fkRelsOf(d, tableId, columnId)[0];
  return r ? { tableId: r.from, columnId: r.fromCol } : null;
}

export function primaryKeyColumns(t: Table): Column[] {
  return t.columns.filter((c) => c.pk);
}

/** "PK", "FK", "PK FK" or "" — the badge shown beside a column. */
export function keyLabel(d: Diagram, t: Table, c: Column): string {
  const fk = isForeignKey(d, t.id, c.id);
  return c.pk && fk ? "PK FK" : c.pk ? "PK" : fk ? "FK" : "";
}

export function relsOfTable(d: Diagram, tableId: string): Relationship[] {
  return d.rels.filter((r) => r.from === tableId || r.to === tableId);
}

/** Naive English singular: `orders` → `order`, `categories` → `category`. */
export function singular(name: string): string {
  const n = String(name || "").toLowerCase();
  if (/ies$/.test(n)) return n.slice(0, -3) + "y";
  if (/(ses|xes|zes|ches|shes)$/.test(n)) return n.slice(0, -2);
  if (/s$/.test(n) && !/ss$/.test(n)) return n.slice(0, -1);
  return n;
}

/** A name not already used by another table: `table_1`, `table_2`, … */
export function uniqueTableName(d: Diagram, base = "table"): string {
  const used = new Set(d.tables.map((t) => t.name.toLowerCase()));
  if (!used.has(base.toLowerCase()) && base !== "table") return base;
  let n = d.tables.length + 1;
  while (used.has(`${base}_${n}`.toLowerCase())) n++;
  return `${base}_${n}`;
}

export function uniqueColumnName(t: Table, base: string): string {
  const used = new Set(t.columns.map((c) => c.name.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let n = 2;
  while (used.has(`${base}_${n}`.toLowerCase())) n++;
  return `${base}_${n}`;
}

/** Human sentence for a relationship: "customers (one) places orders (many)". */
export function relSentence(d: Diagram, r: Relationship): string {
  const a = findTable(d, r.from)?.name ?? "?";
  const b = findTable(d, r.to)?.name ?? "?";
  const v = r.label;
  if (r.type === "1:1") return `${a} (one) ${v || "has"} ${b} (one)`;
  if (r.type === "N:M") return `${a} (many) ${v || "relate to"} ${b} (many)`;
  return `${a} (one) ${v || "has"} ${b} (many)`;
}

export function relShort(d: Diagram, r: Relationship): string {
  const a = findTable(d, r.from)?.name ?? "?";
  const b = findTable(d, r.to)?.name ?? "?";
  return `${a} ${r.type} ${b}${r.label ? ` (${r.label})` : ""}`;
}
