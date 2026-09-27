import type { Diagram, Relationship, Table } from "@/lib/model";
import type {
  EndKind,
  LayoutOptions,
  Notation,
  Point,
  Rect,
  Route,
  RouteEnd,
  RouteOptions,
  TableBox,
  TextMeasurer,
} from "./types";
import { METRICS } from "./types";

export * from "./types";

/**
 * Layout and relationship routing. Pure functions; text measuring is injected
 * so this runs in tests (jsdom has no canvas) and in the browser alike.
 * OWNER: geometry subagent. Replace these stubs.
 */

/** Rough width estimate when no canvas is available (tests, SSR). */
export const estimateText: TextMeasurer = (text, font) =>
  text.length * (font === "head" ? 7.6 : font === "type" ? 6.7 : font === "label" ? 6.4 : 7.3);

export function tableSize(
  t: Table,
  measure: TextMeasurer,
  opts: LayoutOptions,
): { w: number; h: number } {
  void measure;
  void opts;
  return { w: METRICS.MIN_W, h: METRICS.HEAD_H + Math.max(1, t.columns.length) * METRICS.ROW_H };
}

/** Lay out every table. */
export function layoutTables(
  d: Diagram,
  measure: TextMeasurer,
  opts: LayoutOptions,
): Map<string, TableBox> {
  const out = new Map<string, TableBox>();
  for (const t of d.tables) {
    const { w, h } = tableSize(t, measure, opts);
    const rowY: Record<string, number> = {};
    t.columns.forEach(
      (c, i) => (rowY[c.id] = t.y + METRICS.HEAD_H + i * METRICS.ROW_H + METRICS.ROW_H / 2),
    );
    out.set(t.id, { id: t.id, x: t.x, y: t.y, w, h, rowY });
  }
  return out;
}

/** Route every relationship around the tables. */
export function routeRelationships(
  d: Diagram,
  boxes: Map<string, TableBox>,
  opts: RouteOptions,
): Map<string, Route> {
  void opts;
  const out = new Map<string, Route>();
  for (const r of d.rels) {
    const a = boxes.get(r.from);
    const b = boxes.get(r.to);
    if (!a || !b) continue;
    const p0 = { x: a.x + a.w, y: a.y + a.h / 2 };
    const p1 = { x: b.x, y: b.y + b.h / 2 };
    out.set(r.id, {
      relId: r.id,
      d: `M${p0.x} ${p0.y}L${p1.x} ${p1.y}`,
      points: [p0, p1],
      start: { point: p0, dir: { x: 1, y: 0 }, side: "right" },
      end: { point: p1, dir: { x: -1, y: 0 }, side: "left" },
      labelAt: { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 },
    });
  }
  return out;
}

/** The two end kinds for a relationship: [at `from`, at `to`]. */
export function endKinds(r: Relationship): [EndKind, EndKind] {
  const fromMax = r.type === "N:M" ? "many" : "one";
  const toMax = r.type === "1:1" ? "one" : "many";
  return [
    { max: fromMax, optional: r.fromOptional },
    { max: toMax, optional: r.toOptional },
  ];
}

/** SVG path `d` for the marker at one end (crow's foot), or "" for numeric notation. */
export function markerPath(end: RouteEnd, kind: EndKind, notation: Notation): string {
  void end;
  void kind;
  void notation;
  return "";
}

/** Bounding box of all tables and routes, grown by `pad`. */
export function diagramBounds(
  boxes: Map<string, TableBox>,
  routes: Map<string, Route>,
  pad = 0,
): Rect {
  let x1 = Infinity,
    y1 = Infinity,
    x2 = -Infinity,
    y2 = -Infinity;
  const add = (p: Point) => {
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x);
    y2 = Math.max(y2, p.y);
  };
  boxes.forEach((b) => {
    add(b);
    add({ x: b.x + b.w, y: b.y + b.h });
  });
  routes.forEach((r) => r.points.forEach(add));
  if (!Number.isFinite(x1)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
}

/** "Tidy up": new top-left positions for every table. */
export function autoLayout(d: Diagram, boxes: Map<string, TableBox>): Map<string, Point> {
  void boxes;
  return new Map(d.tables.map((t) => [t.id, { x: t.x, y: t.y }]));
}
