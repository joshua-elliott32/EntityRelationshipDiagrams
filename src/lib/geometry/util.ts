import type { Point, Rect } from "./types";

/** Small numeric helpers shared by the geometry modules. */

export const EPS = 1e-6;

/** Round for SVG output: one decimal, no trailing zeros, no "-0". */
export function fmt(n: number): string {
  const v = Math.round(n * 10) / 10;
  return String(v === 0 ? 0 : v);
}

export function pt(x: number, y: number): Point {
  return { x, y };
}

export function add(p: Point, d: Point, k = 1): Point {
  return { x: p.x + d.x * k, y: p.y + d.y * k };
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function samePoint(a: Point, b: Point, tol = 0.01): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
}

/** Drop repeated points and interior points of straight runs. */
export function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    if (out.length && samePoint(out[out.length - 1], p)) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      const cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x);
      const dot = (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y);
      if (Math.abs(cross) < 0.01 && dot >= 0) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

export function inflate(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 };
}

/** Strictly inside (borders do not count). */
export function insideRect(p: Point, r: Rect, tol = EPS): boolean {
  return p.x > r.x + tol && p.x < r.x + r.w - tol && p.y > r.y + tol && p.y < r.y + r.h - tol;
}

export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
  );
}

/**
 * Does segment a→b pass through the open interior of `r`? Works for any
 * segment (Liang–Barsky clipping against the rectangle shrunk by `tol`).
 */
export function segmentHitsRect(a: Point, b: Point, r: Rect, tol = 0.5): boolean {
  const x1 = r.x + tol;
  const y1 = r.y + tol;
  const x2 = r.x + r.w - tol;
  const y2 = r.y + r.h - tol;
  if (x2 <= x1 || y2 <= y1) return false;
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q > 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (!clip(-dx, a.x - x1)) return false;
  if (!clip(dx, x2 - a.x)) return false;
  if (!clip(-dy, a.y - y1)) return false;
  if (!clip(dy, y2 - a.y)) return false;
  return t1 - t0 > 1e-9;
}

/** Proper crossing of two axis-aligned segments (touching ends do not count). */
export function orthoCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const aH = Math.abs(a1.y - a2.y) < EPS;
  const bH = Math.abs(b1.y - b2.y) < EPS;
  if (aH === bH) return false;
  const [h1, h2, v1, v2] = aH ? [a1, a2, b1, b2] : [b1, b2, a1, a2];
  const x = v1.x;
  const y = h1.y;
  const hx1 = Math.min(h1.x, h2.x);
  const hx2 = Math.max(h1.x, h2.x);
  const vy1 = Math.min(v1.y, v2.y);
  const vy2 = Math.max(v1.y, v2.y);
  return x > hx1 + EPS && x < hx2 - EPS && y > vy1 + EPS && y < vy2 - EPS;
}

export function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** First index with `arr[i] >= v - tol`. */
export function lowerBound(arr: ArrayLike<number>, v: number, tol = EPS): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v - tol) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Last index with `arr[i] <= v + tol` (−1 if none). */
export function upperIndex(arr: ArrayLike<number>, v: number, tol = EPS): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v + tol) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** Sorted, de-duplicated copy (values closer than `tol` merge). */
export function uniqSorted(values: number[], tol = 0.01): number[] {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of s) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

/** Deterministic PRNG (mulberry32) for tests and tie-breaking. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
