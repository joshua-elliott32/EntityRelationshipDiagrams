import type { Diagram, Relationship } from "@/lib/model";
import { ROUTING } from "./constants";
import { polylineCost, simpleRoute } from "./ortho";
import type { Point, Rect, TableBox } from "./types";
import { METRICS } from "./types";
import { inflate, segmentHitsRect } from "./util";

/**
 * Where each relationship meets its tables: which side (left/right) and at
 * which Y. Ends attach at the row of the column they refer to, or at the
 * header when no column is set. Ends that would share a spot are spread
 * apart within their row so lines never sit on top of each other.
 */

export type HSide = "left" | "right";

export interface EndPlan {
  box: TableBox;
  side: HSide;
  /** Row centre (or header centre) this end belongs to. */
  baseY: number;
  /** How far the end may move from `baseY` and stay inside its row. */
  band: number;
  /** Final Y after spreading. */
  y: number;
  /** Straight run before the route may turn. */
  stub: number;
}

export interface RelPlan {
  rel: Relationship;
  index: number;
  self: boolean;
  a: EndPlan;
  b: EndPlan;
}

export function sideDir(side: HSide): Point {
  return { x: side === "right" ? 1 : -1, y: 0 };
}

export function portPoint(e: EndPlan): Point {
  return { x: e.side === "right" ? e.box.x + e.box.w : e.box.x, y: e.y };
}

function colAnchor(box: TableBox, col: string): { y: number; band: number } {
  const y = col ? box.rowY[col] : undefined;
  if (y !== undefined) return { y, band: METRICS.ROW_H / 2 - 4 };
  return { y: box.y + METRICS.HEAD_H / 2, band: METRICS.HEAD_H / 2 - 5 };
}

function end(box: TableBox, side: HSide, a: { y: number; band: number }, stub: number): EndPlan {
  return { box, side, baseY: a.y, band: a.band, y: a.y, stub };
}

/** Pick the second row of a self-loop so the two ends are clearly apart. */
function selfSecondY(box: TableBox, ya: number, yb: number | null): number {
  if (yb !== null && Math.abs(yb - ya) >= ROUTING.SELF_MIN_DY) return yb;
  const lo = box.y + 6;
  const hi = box.y + box.h - 6;
  if (ya + METRICS.ROW_H <= hi) return ya + METRICS.ROW_H;
  if (ya - METRICS.ROW_H >= lo) return ya - METRICS.ROW_H;
  return Math.min(hi, ya + ROUTING.SELF_MIN_DY);
}

/** Estimated cost of attaching on the given sides (used to choose sides). */
function sideCost(
  sa: HSide,
  sb: HSide,
  a: TableBox,
  b: TableBox,
  ya: number,
  yb: number,
  others: Rect[],
): number {
  const pa = { x: sa === "right" ? a.x + a.w : a.x, y: ya };
  const pb = { x: sb === "right" ? b.x + b.w : b.x, y: yb };
  const pts = simpleRoute(pa, sideDir(sa), pb, sideDir(sb), a, b, ROUTING.STUB, ROUTING.STUB);
  let cost = polylineCost(pts);
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const p of pts) {
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x);
    y2 = Math.max(y2, p.y);
  }
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1];
    const q = pts[i];
    const inner = i > 1 && i < pts.length - 1;
    if (inner && (segmentHitsRect(p, q, a) || segmentHitsRect(p, q, b))) cost += 400;
  }
  for (const o of others) {
    if (o.x > x2 || o.x + o.w < x1 || o.y > y2 || o.y + o.h < y1) continue;
    const r = inflate(o, ROUTING.MARGIN - 2);
    for (let i = 1; i < pts.length; i++) {
      if (segmentHitsRect(pts[i - 1], pts[i], r)) cost += 120;
    }
  }
  return cost;
}

function chooseSides(
  a: TableBox,
  b: TableBox,
  ya: number,
  yb: number,
  others: () => Rect[],
): { sa: HSide; sb: HSide; stub: number } {
  const gapRight = b.x - (a.x + a.w);
  const gapLeft = a.x - (b.x + b.w);
  const minFacing = 2 * ROUTING.MARKER_STUB + 2;
  const clampStub = (gap: number) => Math.max(ROUTING.MARKER_STUB, Math.min(ROUTING.STUB, gap / 2));
  if (gapRight >= minFacing) return { sa: "right", sb: "left", stub: clampStub(gapRight) };
  if (gapLeft >= minFacing) return { sa: "left", sb: "right", stub: clampStub(gapLeft) };

  const facing: [HSide, HSide] =
    a.x + a.w / 2 <= b.x + b.w / 2 ? ["right", "left"] : ["left", "right"];
  const options: [HSide, HSide][] = [facing, ["right", "right"], ["left", "left"]];
  const rest = others();
  let best = options[0];
  let bestCost = Infinity;
  for (const o of options) {
    const c = sideCost(o[0], o[1], a, b, ya, yb, rest);
    if (c < bestCost - 0.5) {
      best = o;
      bestCost = c;
    }
  }
  return { sa: best[0], sb: best[1], stub: ROUTING.STUB };
}

export function planPorts(d: Diagram, boxes: Map<string, TableBox>): RelPlan[] {
  const plans: RelPlan[] = [];
  d.rels.forEach((rel, index) => {
    const A = boxes.get(rel.from);
    const B = boxes.get(rel.to);
    if (!A || !B) return;
    if (A === B || rel.from === rel.to) {
      const ea = colAnchor(A, rel.fromCol);
      const ybRaw = rel.toCol && A.rowY[rel.toCol] !== undefined ? A.rowY[rel.toCol] : null;
      const yb = selfSecondY(A, ea.y, ybRaw);
      const eb = ybRaw === yb ? colAnchor(A, rel.toCol) : { y: yb, band: METRICS.ROW_H / 2 - 4 };
      plans.push({
        rel,
        index,
        self: true,
        a: end(A, "right", ea, ROUTING.SELF_OUT),
        b: end(A, "right", eb, ROUTING.SELF_OUT),
      });
      return;
    }
    const ea = colAnchor(A, rel.fromCol);
    const eb = colAnchor(B, rel.toCol);
    const others = () => {
      const list: Rect[] = [];
      boxes.forEach((o) => {
        if (o !== A && o !== B) list.push(o);
      });
      return list;
    };
    const { sa, sb, stub } = chooseSides(A, B, ea.y, eb.y, others);
    plans.push({ rel, index, self: false, a: end(A, sa, ea, stub), b: end(B, sb, eb, stub) });
  });
  spreadPorts(plans);
  return plans;
}

interface Slot {
  e: EndPlan;
  other: EndPlan;
  plan: RelPlan;
  /** Is the far end on the same side (C shape / self-loop) rather than facing? */
  sameSide: boolean;
}

/** Fan out ends that share a table side and row so each line gets its own spot. */
function spreadPorts(plans: RelPlan[]): void {
  const groups = new Map<string, Slot[]>();
  const push = (s: Slot) => {
    const key = `${s.e.box.id}|${s.e.side}|${Math.round(s.e.baseY)}`;
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  };
  for (const p of plans) {
    const sameSide = p.a.side === p.b.side;
    push({ e: p.a, other: p.b, plan: p, sameSide });
    push({ e: p.b, other: p.a, plan: p, sameSide });
  }
  groups.forEach((g) => {
    if (g.length < 2) return;
    // Facing lines keep their vertical order (upper goes to upper). Lines that
    // wrap around on the same side nest, so their order flips.
    const key = (s: Slot) => (s.sameSide ? -s.other.baseY : s.other.baseY);
    const tie = (s: Slot) =>
      s.sameSide && s.e.box.id > s.other.box.id ? -s.plan.index : s.plan.index;
    g.sort((p, q) => key(p) - key(q) || tie(p) - tie(q) || (p.e === p.plan.a ? -1 : 1));
    const n = g.length;
    const band = Math.min(...g.map((s) => s.e.band));
    const step = Math.min(ROUTING.PORT_SPREAD, (band * 2) / (n - 1));
    g.forEach((s, k) => {
      s.e.y = s.e.baseY + (k - (n - 1) / 2) * step;
    });
  });
}
