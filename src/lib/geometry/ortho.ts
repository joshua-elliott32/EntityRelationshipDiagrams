import { ROUTING } from "./constants";
import type { Point, Rect } from "./types";
import {
  add,
  inflate,
  insideRect,
  lowerBound,
  segmentHitsRect,
  simplify,
  uniqSorted,
  upperIndex,
} from "./util";

/**
 * Orthogonal connector routing.
 *
 * Each connector gets its own sparse "visibility grid": the interesting x and
 * y coordinates (obstacle edges inflated by a margin, the two stub ends, and
 * midpoints between them) inside a region around the two ends. A* then runs
 * over (grid node × heading) states with a bend penalty, so the cheapest
 * route is short *and* has few corners. The region starts small and grows
 * only when no route fits, which keeps the grid tiny for the common case of
 * neighbouring tables.
 */

export interface OrthoRequest {
  /** Port on the start table's border and its outward unit direction. */
  pa: Point;
  da: Point;
  /** Port on the end table's border and its outward unit direction. */
  pb: Point;
  db: Point;
  /** Straight run out of each port before the route may turn. */
  stubA: number;
  stubB: number;
  /** Tables the route must not cross (raw rectangles; inflated here). */
  obstacles: Rect[];
  /** The start/end tables (raw); used by the fallback route. */
  a: Rect;
  b: Rect;
}

const OPP = [1, 0, 3, 2];
/** Extra cost factor for running along a line that hugs an obstacle. */
const HUG = 0.04;
const PADS = [80, 320, Infinity];

interface CacheEntry {
  region: Rect;
  sig: string;
  path: Point[];
}
const CACHE_MAX = 4000;
const cache = new Map<string, CacheEntry>();

/** Forget cached routes (tests and benchmarks use this to measure cold routing). */
export function clearRouteCache(): void {
  cache.clear();
}

function regionSig(region: Rect, obs: Rect[]): string {
  const rx2 = region.x + region.w;
  const ry2 = region.y + region.h;
  let s = "";
  for (const o of obs) {
    if (o.x < rx2 && o.x + o.w > region.x && o.y < ry2 && o.y + o.h > region.y) {
      s += `${o.x},${o.y},${o.w},${o.h};`;
    }
  }
  return s;
}

export function dirIndex(d: Point): number {
  return d.x > 0.5 ? 0 : d.x < -0.5 ? 1 : d.y > 0.5 ? 2 : 3;
}

/** Route one connector; returns the polyline from `pa` to `pb` (corners only). */
export function routeOrthogonal(req: OrthoRequest): Point[] {
  const { pa, da, pb, db } = req;
  const qa = add(pa, da, req.stubA);
  const qb = add(pb, db, req.stubB);

  // Facing ports on one line with a clear view: a single straight segment.
  if (
    Math.abs(pa.y - pb.y) < 0.5 &&
    da.x !== 0 &&
    da.x === -db.x &&
    (pb.x - pa.x) * da.x >= 2 * ROUTING.MARKER_STUB - 0.5 &&
    !req.obstacles.some((o) =>
      segmentHitsRect(pa, pb, o === req.a || o === req.b ? o : inflate(o, ROUTING.MARGIN - 2)),
    )
  ) {
    return [pa, pb];
  }

  // Inflate obstacles, relaxing any that swallow a stub end (tables that
  // overlap or nearly touch) so the search can still start and finish.
  const obs: Rect[] = [];
  for (const r of req.obstacles) {
    let o = inflate(r, ROUTING.MARGIN);
    if (insideRect(qa, o) || insideRect(qb, o)) {
      o = r;
      if (insideRect(qa, o) || insideRect(qb, o)) continue;
    }
    obs.push(o);
  }

  // Dragging re-routes every pointermove, but most connectors are unaffected:
  // reuse a previous route when its ends and the obstacles in its search
  // region are unchanged (the search result depends on nothing else).
  const key = `${pa.x},${pa.y},${dirIndex(da)},${pb.x},${pb.y},${dirIndex(db)},${req.stubA},${req.stubB}`;
  const hit = cache.get(key);
  if (hit && hit.sig === regionSig(hit.region, obs)) {
    cache.delete(key);
    cache.set(key, hit);
    return hit.path.map((p) => ({ x: p.x, y: p.y }));
  }

  let lastRegion: Rect | null = null;
  for (const pad of PADS) {
    let region: Rect;
    if (pad === Infinity) {
      let x1 = Math.min(qa.x, qb.x);
      let y1 = Math.min(qa.y, qb.y);
      let x2 = Math.max(qa.x, qb.x);
      let y2 = Math.max(qa.y, qb.y);
      for (const o of obs) {
        x1 = Math.min(x1, o.x);
        y1 = Math.min(y1, o.y);
        x2 = Math.max(x2, o.x + o.w);
        y2 = Math.max(y2, o.y + o.h);
      }
      const m = ROUTING.MARGIN * 2;
      region = { x: x1 - m, y: y1 - m, w: x2 - x1 + m * 2, h: y2 - y1 + m * 2 };
      if (
        lastRegion &&
        region.x >= lastRegion.x &&
        region.y >= lastRegion.y &&
        region.x + region.w <= lastRegion.x + lastRegion.w &&
        region.y + region.h <= lastRegion.y + lastRegion.h
      ) {
        break;
      }
    } else {
      const x1 = Math.min(qa.x, qb.x) - pad;
      const y1 = Math.min(qa.y, qb.y) - pad;
      region = {
        x: x1,
        y: y1,
        w: Math.max(qa.x, qb.x) + pad - x1,
        h: Math.max(qa.y, qb.y) + pad - y1,
      };
    }
    lastRegion = region;
    const path = searchRegion(qa, dirIndex(da), qb, OPP[dirIndex(db)], region, obs);
    if (path) {
      const out = simplify([pa, ...path, pb]);
      if (pad !== Infinity) {
        cache.set(key, { region, sig: regionSig(region, obs), path: out.map((p) => ({ ...p })) });
        if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
      }
      return out;
    }
  }
  return simpleRoute(pa, da, pb, db, req.a, req.b, req.stubA, req.stubB);
}

function axisCoords(
  lo: number,
  hi: number,
  a: number,
  b: number,
  starts: number[],
  ends: number[],
): { v: number[]; w: Float64Array } {
  // Preferred lines: halfway between the two ends, and down the middle of
  // each free channel (an obstacle's far edge followed directly by another's
  // near edge). Obstacle edges themselves cost a little more to run along.
  const preferred: number[] = [(a + b) / 2];
  const edges: { v: number; start: boolean }[] = [];
  for (const v of starts) edges.push({ v, start: true });
  for (const v of ends) edges.push({ v, start: false });
  edges.sort((p, q) => p.v - q.v || (p.start ? 1 : -1));
  let open = 0;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    open += e.start ? 1 : -1;
    const next = edges[i + 1];
    if (open === 0 && next && next.start && next.v - e.v > 1) preferred.push((e.v + next.v) / 2);
  }
  const all = uniqSorted([lo, hi, a, b, ...starts, ...ends, ...preferred]).filter(
    (v) => v >= lo - 1e-6 && v <= hi + 1e-6,
  );
  const pref = uniqSorted(preferred);
  const w = new Float64Array(all.length);
  for (let i = 0; i < all.length; i++) {
    const k = lowerBound(pref, all[i], 0.01);
    w[i] = k < pref.length && Math.abs(pref[k] - all[i]) <= 0.01 ? 1 : 1 + HUG;
  }
  return { v: all, w };
}

class Heap {
  private f: number[] = [];
  private s: number[] = [];
  get size(): number {
    return this.f.length;
  }
  push(f: number, s: number): void {
    const F = this.f;
    const S = this.s;
    let i = F.length;
    F.push(f);
    S.push(s);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= f) break;
      F[i] = F[p];
      S[i] = S[p];
      i = p;
    }
    F[i] = f;
    S[i] = s;
  }
  pop(): number {
    const F = this.f;
    const S = this.s;
    const top = S[0];
    const lf = F.pop()!;
    const ls = S.pop()!;
    const n = F.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && F[r] < F[l] ? r : l;
        if (F[c] >= lf) break;
        F[i] = F[c];
        S[i] = S[c];
        i = c;
      }
      F[i] = lf;
      S[i] = ls;
    }
    return top;
  }
}

function searchRegion(
  qa: Point,
  startDir: number,
  qb: Point,
  goalDir: number,
  region: Rect,
  allObs: Rect[],
): Point[] | null {
  const rx2 = region.x + region.w;
  const ry2 = region.y + region.h;
  const obs = allObs.filter(
    (o) => o.x < rx2 && o.x + o.w > region.x && o.y < ry2 && o.y + o.h > region.y,
  );
  const x0: number[] = [];
  const x1: number[] = [];
  const y0: number[] = [];
  const y1: number[] = [];
  for (const o of obs) {
    x0.push(o.x);
    x1.push(o.x + o.w);
    y0.push(o.y);
    y1.push(o.y + o.h);
  }
  const X = axisCoords(region.x, rx2, qa.x, qb.x, x0, x1);
  const Y = axisCoords(region.y, ry2, qa.y, qb.y, y0, y1);
  const xs = X.v;
  const ys = Y.v;
  const nx = xs.length;
  const ny = ys.length;

  // Blocked edges: horizontal edge (i→i+1, row j) at j*nx+i; vertical edge
  // (column i, j→j+1) at i*ny+j. An edge is blocked when its interior lies
  // inside an obstacle; obstacle edges are grid lines, so this is exact.
  const blockH = new Uint8Array(nx * ny);
  const blockV = new Uint8Array(nx * ny);
  for (const o of obs) {
    const i0 = lowerBound(xs, o.x);
    const i1 = upperIndex(xs, o.x + o.w);
    const j0 = lowerBound(ys, o.y);
    const j1 = upperIndex(ys, o.y + o.h);
    if (i1 < 0 || j1 < 0) continue;
    for (let j = j0; j <= j1; j++) {
      if (ys[j] <= o.y + 1e-6 || ys[j] >= o.y + o.h - 1e-6) continue;
      for (let i = i0; i < i1; i++) blockH[j * nx + i] = 1;
    }
    for (let i = i0; i <= i1; i++) {
      if (xs[i] <= o.x + 1e-6 || xs[i] >= o.x + o.w - 1e-6) continue;
      for (let j = j0; j < j1; j++) blockV[i * ny + j] = 1;
    }
  }

  const find = (arr: number[], v: number): number => {
    const k = lowerBound(arr, v, 0.02);
    return k < arr.length && Math.abs(arr[k] - v) <= 0.02 ? k : -1;
  };
  const si = find(xs, qa.x);
  const sj = find(ys, qa.y);
  const gi = find(xs, qb.x);
  const gj = find(ys, qb.y);
  if (si < 0 || sj < 0 || gi < 0 || gj < 0) return null;

  const nStates = nx * ny * 4;
  const GOAL = nStates;
  const g = new Float64Array(nStates + 1).fill(Infinity);
  const prev = new Int32Array(nStates + 1).fill(-1);
  const closed = new Uint8Array(nStates + 1);
  const heap = new Heap();
  const gx = qb.x;
  const gy = qb.y;
  const BEND = ROUTING.BEND_COST;

  // Admissible estimate: Manhattan distance plus the bends that are
  // unavoidable given the current heading (reversing is not allowed).
  const h = (x: number, y: number, d: number): number => {
    const dx = gx - x;
    const dy = gy - y;
    const ahead = d === 0 ? dx : d === 1 ? -dx : d === 2 ? dy : -dy;
    const side = d < 2 ? Math.abs(dy) : Math.abs(dx);
    const bends = side < 1e-6 ? (ahead >= -1e-6 ? 0 : 2) : ahead < -1e-6 ? 2 : 1;
    return Math.abs(dx) + Math.abs(dy) + bends * BEND;
  };

  const start = (sj * nx + si) * 4 + startDir;
  g[start] = 0;
  heap.push(h(qa.x, qa.y, startDir), start);

  while (heap.size) {
    const s = heap.pop();
    if (closed[s]) continue;
    closed[s] = 1;
    if (s === GOAL) break;
    const d = s & 3;
    const node = s >> 2;
    const i = node % nx;
    const j = (node - i) / nx;
    const gs = g[s];
    if (i === gi && j === gj) {
      if (d !== OPP[goalDir]) {
        const total = gs + (d === goalDir ? 0 : BEND);
        if (total < g[GOAL]) {
          g[GOAL] = total;
          prev[GOAL] = s;
          heap.push(total, GOAL);
        }
      }
    }
    for (let nd = 0; nd < 4; nd++) {
      if (nd === OPP[d]) continue;
      let ni = i;
      let nj = j;
      let len: number;
      if (nd === 0) {
        if (i + 1 >= nx || blockH[j * nx + i]) continue;
        ni = i + 1;
        len = (xs[ni] - xs[i]) * Y.w[j];
      } else if (nd === 1) {
        if (i === 0 || blockH[j * nx + i - 1]) continue;
        ni = i - 1;
        len = (xs[i] - xs[ni]) * Y.w[j];
      } else if (nd === 2) {
        if (j + 1 >= ny || blockV[i * ny + j]) continue;
        nj = j + 1;
        len = (ys[nj] - ys[j]) * X.w[i];
      } else {
        if (j === 0 || blockV[i * ny + j - 1]) continue;
        nj = j - 1;
        len = (ys[j] - ys[nj]) * X.w[i];
      }
      const ns = (nj * nx + ni) * 4 + nd;
      if (closed[ns]) continue;
      const cost = gs + len + (nd === d ? 0 : BEND);
      if (cost < g[ns]) {
        g[ns] = cost;
        prev[ns] = s;
        // Ties on f go to the deeper state (larger g): far fewer expansions on open ground.
        heap.push(cost + h(xs[ni], ys[nj], nd) - cost * 1e-7, ns);
      }
    }
  }
  if (!closed[GOAL]) return null;

  const nodes: Point[] = [];
  for (let s = prev[GOAL]; s >= 0; s = prev[s]) {
    const node = s >> 2;
    const i = node % nx;
    const j = (node - i) / nx;
    nodes.push({ x: xs[i], y: ys[j] });
  }
  nodes.reverse();
  // Snap the ends back to the exact stub points (grid values are merged within 0.02px).
  nodes[0] = { ...qa };
  nodes[nodes.length - 1] = { ...qb };
  return nodes;
}

/**
 * A plain route without obstacle avoidance: Z for facing sides, C (bracket)
 * for sides pointing the same way, and an S around the gap between the tables
 * when facing sides overlap. Also used to estimate the cost of a side choice.
 */
export function simpleRoute(
  pa: Point,
  da: Point,
  pb: Point,
  db: Point,
  a: Rect,
  b: Rect,
  stubA: number,
  stubB: number,
): Point[] {
  const qa = add(pa, da, stubA);
  const qb = add(pb, db, stubB);
  if (da.x === db.x) {
    const xe = da.x > 0 ? Math.max(qa.x, qb.x) : Math.min(qa.x, qb.x);
    return simplify([pa, { x: xe, y: pa.y }, { x: xe, y: pb.y }, pb]);
  }
  if ((qb.x - qa.x) * da.x >= 0) {
    if (Math.abs(pa.y - pb.y) < 0.5) return [pa, pb];
    const mx = (qa.x + qb.x) / 2;
    return simplify([pa, { x: mx, y: pa.y }, { x: mx, y: pb.y }, pb]);
  }
  let my: number;
  if (a.y + a.h <= b.y) my = (a.y + a.h + b.y) / 2;
  else if (b.y + b.h <= a.y) my = (b.y + b.h + a.y) / 2;
  else {
    const top = Math.min(a.y, b.y) - Math.max(stubA, stubB);
    const bottom = Math.max(a.y + a.h, b.y + b.h) + Math.max(stubA, stubB);
    const avg = (pa.y + pb.y) / 2;
    my = avg - top <= bottom - avg ? top : bottom;
  }
  return simplify([pa, qa, { x: qa.x, y: my }, { x: qb.x, y: my }, qb, pb]);
}

/** Length plus bend penalty of a polyline. */
export function polylineCost(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  }
  return len + Math.max(0, points.length - 2) * ROUTING.BEND_COST;
}
