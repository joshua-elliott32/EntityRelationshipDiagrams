import { makeColumn, makeRelationship, makeTable } from "@/lib/model";
import type { Diagram, Relationship, Table } from "@/lib/model";
import { estimateText, layoutTables } from "./measure";
import type { Point, Rect, TableBox } from "./types";
import { segmentHitsRect } from "./util";

/** Test helpers (not exported from the package index). */

export function table(name: string, x: number, y: number, cols = 4): Table {
  return makeTable(name, x, y, {
    columns: Array.from({ length: cols }, (_, i) =>
      makeColumn(i === 0 ? `${name}_id` : `col_${i}`, i === 0 ? "INT" : "VARCHAR(40)", {
        pk: i === 0,
      }),
    ),
  });
}

export function rel(a: Table, b: Table, o: Partial<Relationship> = {}): Relationship {
  return makeRelationship(a.id, b.id, o);
}

export function diagram(tables: Table[], rels: Relationship[]): Diagram {
  return { version: 2, name: "t", tables, rels, view: null, updatedAt: 0 };
}

export function boxesOf(d: Diagram): Map<string, TableBox> {
  return layoutTables(d, estimateText, { showDataTypes: true });
}

export function segments(points: Point[]): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (let i = 1; i < points.length; i++) out.push([points[i - 1], points[i]]);
  return out;
}

export function hits(points: Point[], r: Rect): boolean {
  return segments(points).some(([a, b]) => segmentHitsRect(a, b, r, 0.5));
}
