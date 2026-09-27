import type { Point, Rect, Route, TableBox } from "./types";
import { ROUTING } from "./constants";

/**
 * Bounding box of all tables and routes (every corner / curve sample,
 * including self-loops, and the label centres), grown by `pad`.
 */
export function diagramBounds(
  boxes: Map<string, TableBox>,
  routes: Map<string, Route>,
  pad = 0,
): Rect {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
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
  routes.forEach((r) => {
    r.points.forEach(add);
    const h = ROUTING.LABEL_H / 2;
    add({ x: r.labelAt.x, y: r.labelAt.y - h });
    add({ x: r.labelAt.x, y: r.labelAt.y + h });
  });
  if (!Number.isFinite(x1)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
}
