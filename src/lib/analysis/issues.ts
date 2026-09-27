import type { Column, Table } from "@/lib/model";
import type { Issue } from "./types";

/** Display name for a table in messages. */
export const tName = (t: Table): string => t.name.trim() || "untitled";

/** Display name for a column in messages. */
export const cName = (c: Column): string => c.name.trim() || "(unnamed)";

/** `table.column` */
export const qName = (t: Table, c: Column): string => `${tName(t)}.${cName(c)}`;

/** `a`, `a + b`, `a + b + c` — how a composite key or determinant is shown. */
export const joinPlus = (cols: Column[]): string => cols.map(cName).join(" + ");

/** `a`, `a and b`, `a, b and c` */
export function listAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Straight quotes around UI labels would look odd; use typographic ones. */
export const ui = (label: string): string => `“${label}”`;

export function makeIssue(
  o: Omit<Issue, "relId" | "tableId" | "columnIds"> & Partial<Issue>,
): Issue {
  return { tableId: null, relId: null, columnIds: [], ...o };
}
