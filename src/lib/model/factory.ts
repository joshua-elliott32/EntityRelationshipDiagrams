import { uid } from "./ids";
import type { Column, Diagram, Relationship, Table } from "./types";

export function makeColumn(name = "", type = "VARCHAR(100)", o: Partial<Column> = {}): Column {
  return {
    id: uid(),
    name,
    type,
    pk: false,
    unique: false,
    nullable: false,
    multi: false,
    determinedBy: [],
    defaultValue: "",
    note: "",
    ...o,
  };
}

export function makeTable(name: string, x = 0, y = 0, o: Partial<Table> = {}): Table {
  return {
    id: uid(),
    name,
    x,
    y,
    color: null,
    note: "",
    columns: [],
    ...o,
  };
}

export function makeRelationship(
  from: string,
  to: string,
  o: Partial<Omit<Relationship, "from" | "to">> = {},
): Relationship {
  return {
    id: uid(),
    from,
    fromCol: "",
    to,
    toCol: "",
    type: "1:N",
    label: "",
    fromOptional: false,
    toOptional: true,
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
    ...o,
  };
}

export function blankDiagram(name = "Untitled diagram"): Diagram {
  return { version: 2, name, tables: [], rels: [], view: null, updatedAt: 0 };
}
