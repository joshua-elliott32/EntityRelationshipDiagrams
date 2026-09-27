import { ROUTING } from "./constants";
import type { Point } from "./types";
import { EPS, orthoCross } from "./util";

/**
 * Post-pass that separates collinear, overlapping segments of different
 * routes (e.g. two lines that A* sent down the same channel) by a few px.
 * Segments touching a table port never move; the segments next to them may
 * only move as far as keeps the port run at least `minStub` long.
 */

interface Member {
  r: number;
  k: number;
  lo: number;
  hi: number;
  fixed: boolean;
  min: number;
  max: number;
}

export function nudgeRoutes(paths: Point[][], minStub: number = ROUTING.MARKER_STUB): void {
  nudgeAxis(paths, true, minStub);
  nudgeAxis(paths, false, minStub);
}

/** `vertical` = handle vertical segments (shift in x); else horizontal (shift in y). */
function nudgeAxis(paths: Point[][], vertical: boolean, minStub: number): void {
  const c = (p: Point) => (vertical ? p.x : p.y);
  const along = (p: Point) => (vertical ? p.y : p.x);
  const groups = new Map<number, Member[]>();

  paths.forEach((pts, r) => {
    const n = pts.length;
    for (let k = 0; k + 1 < n; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      if (Math.abs(c(a) - c(b)) > EPS) continue;
      if (Math.abs(along(a) - along(b)) < EPS) continue;
      const fixed = k === 0 || k === n - 2;
      let min = -Infinity;
      let max = Infinity;
      if (!fixed) {
        // Keep the neighbouring segments pointing the same way and long enough.
        const limit = (from: Point, to: Point, isPort: boolean, sign: 1 | -1) => {
          // New length = (to - from) + sign * o must keep its sign and exceed `need`.
          const len = c(to) - c(from);
          const need = isPort ? minStub : 2;
          if (Math.abs(len) < need) {
            min = Math.max(min, 0);
            max = Math.min(max, 0);
            return;
          }
          const s = Math.sign(len);
          // s * (len + sign*o) >= need  →  sign*s*o >= need - |len|
          const bound = need - Math.abs(len);
          if (sign * s > 0) min = Math.max(min, bound);
          else max = Math.min(max, -bound);
        };
        limit(pts[k - 1], a, k - 1 === 0, 1);
        limit(b, pts[k + 2], k + 1 === n - 2, -1);
      }
      const key = Math.round(c(a) * 100) / 100;
      const m: Member = {
        r,
        k,
        lo: Math.min(along(a), along(b)),
        hi: Math.max(along(a), along(b)),
        fixed,
        min,
        max,
      };
      const g = groups.get(key);
      if (g) g.push(m);
      else groups.set(key, [m]);
    }
  });

  const shifts: { m: Member; o: number }[] = [];
  groups.forEach((g) => {
    g.sort((p, q) => p.lo - q.lo || p.r - q.r || p.k - q.k);
    let cluster: Member[] = [];
    let hi = -Infinity;
    const flush = () => {
      if (cluster.length > 1 && new Set(cluster.map((m) => m.r)).size > 1) {
        for (const s of solveCluster(cluster, paths, vertical)) shifts.push(s);
      }
    };
    for (const m of g) {
      if (cluster.length && m.lo < hi - 1) {
        cluster.push(m);
        hi = Math.max(hi, m.hi);
      } else {
        flush();
        cluster = [m];
        hi = m.hi;
      }
    }
    flush();
  });

  for (const { m, o } of shifts) {
    if (!o) continue;
    const pts = paths[m.r];
    for (const i of [m.k, m.k + 1]) {
      pts[i] = vertical ? { x: pts[i].x + o, y: pts[i].y } : { x: pts[i].x, y: pts[i].y + o };
    }
  }
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  items.forEach((it, i) => {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const p of permutations(rest)) out.push([it, ...p]);
  });
  return out;
}

function solveCluster(
  cluster: Member[],
  paths: Point[][],
  vertical: boolean,
): { m: Member; o: number }[] {
  // At most one segment can stay put at offset 0 (a port run); others fixed ones are left alone.
  const fixed = cluster.filter((m) => m.fixed);
  const anchor = fixed[0] ?? null;
  const members = cluster.filter((m) => !m.fixed || m === anchor);
  if (members.length < 2) return [];

  const shift = (p: Point, o: number): Point =>
    vertical ? { x: p.x + o, y: p.y } : { x: p.x, y: p.y + o };

  const evaluate = (order: Member[]) => {
    const n = order.length;
    const f = anchor ? order.indexOf(anchor) : -1;
    let offsets: number[];
    if (f >= 0) {
      const steps = Math.max(f, n - 1 - f);
      const sp = Math.min(ROUTING.NUDGE, ROUTING.MAX_NUDGE / steps);
      offsets = order.map((_, k) => (k - f) * sp);
    } else {
      const sp = Math.min(ROUTING.NUDGE, (ROUTING.MAX_NUDGE * 2) / (n - 1));
      offsets = order.map((_, k) => (k - (n - 1) / 2) * sp);
    }
    let clampCost = 0;
    offsets = offsets.map((o, k) => {
      const m = order[k];
      const v = Math.max(m.min, Math.min(m.max, o));
      clampCost += Math.abs(v - o);
      return v;
    });
    // Count crossings between the moved segment and its two neighbours.
    const pieces = order.map((m, k) => {
      const pts = paths[m.r];
      const o = offsets[k];
      const a = shift(pts[m.k], o);
      const b = shift(pts[m.k + 1], o);
      const segs: [Point, Point][] = [[a, b]];
      if (m.k > 0) segs.push([pts[m.k - 1], a]);
      if (m.k + 2 < pts.length) segs.push([b, pts[m.k + 2]]);
      return segs;
    });
    let crossings = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (order[i].r === order[j].r) continue;
        for (const s of pieces[i]) {
          for (const t of pieces[j]) if (orthoCross(s[0], s[1], t[0], t[1])) crossings++;
        }
      }
    }
    const spread = offsets.reduce((s, o) => s + Math.abs(o), 0);
    return { score: crossings * 1000 + clampCost * 10 + spread * 0.01, offsets };
  };

  const orders = members.length <= 4 ? permutations(members) : [members];
  let best: { score: number; offsets: number[] } | null = null;
  let bestOrder = members;
  for (const order of orders) {
    const res = evaluate(order);
    if (!best || res.score < best.score - 1e-9) {
      best = res;
      bestOrder = order;
    }
  }
  return bestOrder.map((m, k) => ({ m, o: best!.offsets[k] }));
}
