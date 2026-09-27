import {
  diagramBounds,
  layoutTables,
  routeRelationships,
  type LineStyle,
  type Point,
  type Rect,
  type Route,
  type RouteEnd,
  type TableBox,
  type TextMeasurer,
} from "@/lib/geometry";
import type { Diagram, Relationship, Table } from "@/lib/model";
import { PILL_H, pillWidth } from "./pill";

/**
 * Layout + routing with object identity preserved for anything that didn't
 * change. Immer keeps untouched tables and relationships as the same objects,
 * and layout/routing always return fresh ones; reusing the previous box or
 * route when it is equal lets the memoised table and line components skip
 * re-rendering — dragging one table only repaints that table and its lines.
 */

export interface Layout {
  boxes: Map<string, TableBox>;
  routes: Map<string, Route>;
}

const boxCache = new WeakMap<Table, TableBox>();
const routeCache = new WeakMap<Relationship, Route>();

function sameBox(a: TableBox, b: TableBox): boolean {
  if (a.id !== b.id || a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h) return false;
  const ka = Object.keys(a.rowY);
  if (ka.length !== Object.keys(b.rowY).length) return false;
  return ka.every((k) => a.rowY[k] === b.rowY[k]);
}

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const sameEnd = (a: RouteEnd, b: RouteEnd) =>
  a.side === b.side && samePoint(a.point, b.point) && samePoint(a.dir, b.dir);

function sameRoute(a: Route, b: Route): boolean {
  return (
    a.relId === b.relId &&
    a.d === b.d &&
    samePoint(a.labelAt, b.labelAt) &&
    sameEnd(a.start, b.start) &&
    sameEnd(a.end, b.end) &&
    a.points.length === b.points.length &&
    a.points.every((p, i) => samePoint(p, b.points[i]))
  );
}

export function computeLayout(
  tables: Table[],
  rels: Relationship[],
  measure: TextMeasurer,
  opts: { showDataTypes: boolean; lineStyle: LineStyle },
): Layout {
  const d: Diagram = { version: 2, name: "", tables, rels, view: null, updatedAt: 0 };
  const fresh = layoutTables(d, measure, { showDataTypes: opts.showDataTypes });
  const boxes = new Map<string, TableBox>();
  for (const t of tables) {
    const b = fresh.get(t.id);
    if (!b) continue;
    const prev = boxCache.get(t);
    if (prev && sameBox(prev, b)) boxes.set(t.id, prev);
    else {
      boxCache.set(t, b);
      boxes.set(t.id, b);
    }
  }
  const freshRoutes = routeRelationships(d, boxes, {
    style: opts.lineStyle,
    labelSize: (r) => {
      const w = pillWidth(r, measure);
      return w ? { w, h: PILL_H + 2 } : { w: 0, h: 0 };
    },
  });
  const routes = new Map<string, Route>();
  for (const r of rels) {
    const rt = freshRoutes.get(r.id);
    if (!rt) continue;
    const prev = routeCache.get(r);
    if (prev && sameRoute(prev, rt)) routes.set(r.id, prev);
    else {
      routeCache.set(r, rt);
      routes.set(r.id, rt);
    }
  }
  return { boxes, routes };
}

/** diagramBounds plus the full width of every label pill, grown by `pad`. */
export function contentBounds(
  rels: Relationship[],
  layout: Layout,
  measure: TextMeasurer,
  pad = 0,
): Rect {
  const b = diagramBounds(layout.boxes, layout.routes, 0);
  if (!layout.boxes.size) return b;
  let x1 = b.x;
  let y1 = b.y;
  let x2 = b.x + b.w;
  let y2 = b.y + b.h;
  for (const r of rels) {
    const rt = layout.routes.get(r.id);
    if (!rt) continue;
    const hw = pillWidth(r, measure) / 2;
    if (!hw) continue;
    x1 = Math.min(x1, rt.labelAt.x - hw);
    x2 = Math.max(x2, rt.labelAt.x + hw);
    y1 = Math.min(y1, rt.labelAt.y - PILL_H / 2);
    y2 = Math.max(y2, rt.labelAt.y + PILL_H / 2);
  }
  return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
}
