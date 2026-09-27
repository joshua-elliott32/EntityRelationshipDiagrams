/** Tiny builders for the analysis tests. Not used by the app. */
import {
  makeColumn,
  makeRelationship,
  makeTable,
  type Column,
  type Diagram,
  type Relationship,
  type Table,
} from "@/lib/model";
import type { AnalysisOptions } from "./types";

export type ColSpec = Partial<Omit<Column, "determinedBy">> & { by?: string[] };

/** `table("orders", { order_id: { pk: true }, city: { by: ["postcode"] }, postcode: {} })` */
export function table(name: string, spec: Record<string, ColSpec>): Table {
  const columns = Object.entries(spec).map(([n, s]) => {
    const { by, ...rest } = s;
    void by;
    return makeColumn(n, "INT", rest);
  });
  const ids = new Map(columns.map((c) => [c.name, c.id]));
  Object.values(spec).forEach((s, i) => {
    columns[i].determinedBy = (s.by ?? []).map((n) => ids.get(n) ?? n);
  });
  return makeTable(name, 0, 0, { columns });
}

export const col = (t: Table, name: string): Column => {
  const c = t.columns.find((x) => x.name === name);
  if (!c) throw new Error(`no column ${t.name}.${name}`);
  return c;
};

/** Relationship parent.parentCol → child.childCol (either column name may be ""). */
export function rel(
  parent: Table,
  parentCol: string,
  child: Table,
  childCol: string,
  o: Partial<Omit<Relationship, "from" | "to" | "fromCol" | "toCol">> = {},
): Relationship {
  return makeRelationship(parent.id, child.id, {
    fromCol: parentCol ? col(parent, parentCol).id : "",
    toCol: childCol ? col(child, childCol).id : "",
    ...o,
  });
}

export function diagram(tables: Table[], rels: Relationship[] = []): Diagram {
  return { version: 2, name: "test", tables, rels, view: null, updatedAt: 0 };
}

export const ALL: AnalysisOptions = {
  target: "BCNF",
  heuristics: true,
  designChecks: true,
  naming: "off",
};

export const NF_ONLY: AnalysisOptions = { ...ALL, designChecks: false };
