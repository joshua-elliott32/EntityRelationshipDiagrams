import type { Point, Rect, Route } from "@/lib/geometry";
import { MAX_ZOOM, MIN_ZOOM, type Viewport } from "@/lib/model";

/** Pure camera maths for the canvas. */

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const clampZoom = (k: number) => clamp(k, MIN_ZOOM, MAX_ZOOM);

/** Zoom by `factor` keeping the screen point (px, py) fixed. */
export function zoomAround(v: Viewport, px: number, py: number, factor: number): Viewport {
  const k = clampZoom(v.k * factor);
  const wx = (px - v.x) / v.k;
  const wy = (py - v.y) / v.k;
  return { x: px - wx * k, y: py - wy * k, k };
}

/** Camera that shows `bounds` (world rect, already padded), centred, never past 100%. */
export function fitView(bounds: Rect | null, width: number, height: number): Viewport {
  if (!bounds || bounds.w <= 0 || bounds.h <= 0 || width <= 0 || height <= 0)
    return { x: 0, y: 0, k: 1 };
  const b = bounds;
  const k = clampZoom(Math.min(width / b.w, height / b.h, 1));
  return {
    x: Math.round((width - b.w * k) / 2 - b.x * k),
    y: Math.round((height - b.h * k) / 2 - b.y * k),
    k,
  };
}

/** Is the world rect fully inside the viewport (with a margin in px)? */
export function isVisible(r: Rect, v: Viewport, width: number, height: number, margin = 24) {
  const x1 = r.x * v.k + v.x;
  const y1 = r.y * v.k + v.y;
  const x2 = (r.x + r.w) * v.k + v.x;
  const y2 = (r.y + r.h) * v.k + v.y;
  return x1 >= margin && y1 >= margin && x2 <= width - margin && y2 <= height - margin;
}

/** Camera that centres the world rect, zooming out only if it doesn't fit. */
export function revealView(r: Rect, v: Viewport, width: number, height: number): Viewport {
  const pad = 64;
  const k = clampZoom(Math.min(v.k, (width - pad) / r.w, (height - pad) / r.h));
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return { x: width / 2 - cx * k, y: height / 2 - cy * k, k };
}

/** Where a ray from the rect's centre towards `p` leaves the rect. */
export function rectExit(r: Rect, p: Point): Point {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const tx = dx ? r.w / 2 / Math.abs(dx) : Infinity;
  const ty = dy ? r.h / 2 / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty, 1);
  return { x: cx + dx * t, y: cy + dy * t };
}

/** World rect covering a route's polyline. */
export function routeRect(route: Route): Rect {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const p of [...route.points, route.labelAt]) {
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x);
    y2 = Math.max(y2, p.y);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
