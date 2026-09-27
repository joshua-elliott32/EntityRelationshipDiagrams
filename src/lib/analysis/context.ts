import type { Diagram, Relationship, Table } from "@/lib/model";

/** Lookups built once per analysis so each rule stays linear. */
export interface Ctx {
  d: Diagram;
  tableById: Map<string, Table>;
  tableOrder: Map<string, number>;
  relOrder: Map<string, number>;
  /** tableId → columnId → relationships that make that column a foreign key. */
  fkRels: Map<string, Map<string, Relationship[]>>;
}

const NONE: Relationship[] = [];

export function buildCtx(d: Diagram): Ctx {
  const tableById = new Map<string, Table>();
  const tableOrder = new Map<string, number>();
  d.tables.forEach((t, i) => {
    if (!tableById.has(t.id)) {
      tableById.set(t.id, t);
      tableOrder.set(t.id, i);
    }
  });
  const relOrder = new Map<string, number>();
  const fkRels = new Map<string, Map<string, Relationship[]>>();
  d.rels.forEach((r, i) => {
    if (!relOrder.has(r.id)) relOrder.set(r.id, i);
    // Same rule as fkRelsOf in @/lib/model/queries.
    if (r.type === "N:M" || !r.toCol) return;
    let byCol = fkRels.get(r.to);
    if (!byCol) fkRels.set(r.to, (byCol = new Map()));
    const list = byCol.get(r.toCol);
    if (list) list.push(r);
    else byCol.set(r.toCol, [r]);
  });
  return { d, tableById, tableOrder, relOrder, fkRels };
}

export function fkRelsFor(ctx: Ctx, tableId: string, columnId: string): Relationship[] {
  return ctx.fkRels.get(tableId)?.get(columnId) ?? NONE;
}
