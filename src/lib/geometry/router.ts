import type { Diagram, Relationship } from "@/lib/model";
import { ROUTING } from "./constants";
import { placeLabels } from "./labels";
import { estimateText } from "./measure";
import { nudgeRoutes } from "./nudge";
import { routeOrthogonal } from "./ortho";
import { planPorts, portPoint, sideDir, type RelPlan } from "./ports";
import type { Point, Route, RouteOptions, TableBox } from "./types";
import { add, cubicAt, dist, fmt, simplify } from "./util";

/** Size of a relationship's label pill when the caller does not say. */
export function defaultLabelSize(r: Relationship): { w: number; h: number } {
  const text = r.label ? `${r.type}  ${r.label}` : r.type;
  return { w: estimateText(text, "label") + 14, h: ROUTING.LABEL_H };
}

interface Drawn {
  plan: RelPlan;
  pa: Point;
  pb: Point;
  points: Point[];
  d: string;
  candidates: (w: number, h: number) => Point[];
}

/** Route every relationship around the tables. */
export function routeRelationships(
  d: Diagram,
  boxes: Map<string, TableBox>,
  opts: RouteOptions,
): Map<string, Route> {
  const style = opts.style ?? "orthogonal";
  const plans = planPorts(d, boxes);
  const rects = Array.from(boxes.values());
  const drawn: Drawn[] = [];

  if (style === "orthogonal") {
    const paths = plans.map((plan) => {
      const pa = portPoint(plan.a);
      const pb = portPoint(plan.b);
      return routeOrthogonal({
        pa,
        da: sideDir(plan.a.side),
        pb,
        db: sideDir(plan.b.side),
        stubA: plan.a.stub,
        stubB: plan.b.stub,
        obstacles: rects,
        a: plan.a.box,
        b: plan.b.box,
      });
    });
    nudgeRoutes(paths, ROUTING.MARKER_STUB);
    plans.forEach((plan, i) => {
      const pts = paths[i];
      drawn.push({
        plan,
        pa: pts[0],
        pb: pts[pts.length - 1],
        points: pts,
        d: roundedPath(pts, ROUTING.RADIUS, ROUTING.MARKER_STUB),
        candidates: (w, h) => orthoLabelCandidates(pts, w, h),
      });
    });
  } else if (style === "straight") {
    const lines = plans.map(straightRoute);
    // Same-side brackets share vertical runs; spread them like orthogonal routes.
    nudgeRoutes(
      lines.map((l) => l.points),
      ROUTING.MARKER_STUB,
    );
    for (const l of lines) {
      const f = (p: Point) => `${fmt(p.x)} ${fmt(p.y)}`;
      l.d = l.points.map((p, i) => (i ? "L" : "M") + f(p)).join("");
      drawn.push(l);
    }
  } else {
    for (const plan of plans) drawn.push(curvedRoute(plan));
  }

  const sizeOf = opts.labelSize ?? defaultLabelSize;
  const sizes = drawn.map((x) => sizeOf(x.plan.rel));
  const labels = placeLabels(
    drawn.map((x, i) => ({
      candidates: x.candidates(sizes[i].w, sizes[i].h),
      w: sizes[i].w,
      h: sizes[i].h,
    })),
    rects,
  );

  const out = new Map<string, Route>();
  drawn.forEach((x, i) => {
    const { plan } = x;
    out.set(plan.rel.id, {
      relId: plan.rel.id,
      d: x.d,
      points: x.points,
      start: { point: x.pa, dir: sideDir(plan.a.side), side: plan.a.side },
      end: { point: x.pb, dir: sideDir(plan.b.side), side: plan.b.side },
      labelAt: labels[i],
    });
  });
  return out;
}

/**
 * SVG path through `pts` with rounded corners. The radius is clamped to half
 * of each adjacent segment, and corners next to the ends leave at least
 * `keepStraight` px of straight line for the markers.
 */
export function roundedPath(pts: Point[], radius: number, keepStraight = 0): string {
  if (!pts.length) return "";
  let s = `M${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
  const n = pts.length;
  for (let i = 1; i < n - 1; i++) {
    const p = pts[i - 1];
    const c = pts[i];
    const q = pts[i + 1];
    const lin = dist(p, c);
    const lout = dist(c, q);
    let r = Math.min(radius, lin / 2, lout / 2);
    if (i === 1) r = Math.min(r, lin - keepStraight);
    if (i === n - 2) r = Math.min(r, lout - keepStraight);
    r = Math.max(0, r);
    if (r < 0.5 || lin === 0 || lout === 0) {
      s += `L${fmt(c.x)} ${fmt(c.y)}`;
      continue;
    }
    const a = { x: c.x + ((p.x - c.x) / lin) * r, y: c.y + ((p.y - c.y) / lin) * r };
    const b = { x: c.x + ((q.x - c.x) / lout) * r, y: c.y + ((q.y - c.y) / lout) * r };
    s += `L${fmt(a.x)} ${fmt(a.y)}Q${fmt(c.x)} ${fmt(c.y)} ${fmt(b.x)} ${fmt(b.y)}`;
  }
  s += `L${fmt(pts[n - 1].x)} ${fmt(pts[n - 1].y)}`;
  return s;
}

/** Label spots along an orthogonal route: longest segments first, clear of the markers. */
function orthoLabelCandidates(pts: Point[], w: number, h: number): Point[] {
  const n = pts.length;
  const segs: { a: Point; b: Point; len: number; s0: number; s1: number }[] = [];
  for (let k = 0; k + 1 < n; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    const len = dist(a, b);
    if (len < 1) continue;
    const half = Math.abs(a.y - b.y) < 0.01 ? w / 2 : h / 2;
    const keep = ROUTING.MARKER_STUB + 6 + half;
    const s0 = k === 0 ? keep : 0;
    const s1 = k === n - 2 ? len - keep : len;
    segs.push({ a, b, len, s0, s1 });
  }
  const at = (sg: (typeof segs)[number], s: number): Point => ({
    x: sg.a.x + ((sg.b.x - sg.a.x) * s) / sg.len,
    y: sg.a.y + ((sg.b.y - sg.a.y) * s) / sg.len,
  });
  const byLen = segs.slice().sort((p, q) => q.len - p.len);
  const out: Point[] = [];
  for (const sg of byLen) {
    if (sg.s1 < sg.s0) continue;
    const span = sg.s1 - sg.s0;
    out.push(at(sg, sg.s0 + span / 2));
    if (span > 8) out.push(at(sg, sg.s0 + span * 0.2), at(sg, sg.s0 + span * 0.8));
  }
  for (const sg of byLen) out.push(at(sg, sg.len / 2));
  if (!out.length) out.push(pts[0]);
  return out;
}

function alongCandidates(p: Point, q: Point): Point[] {
  return [0.5, 0.35, 0.65, 0.25, 0.75].map((t) => ({
    x: p.x + (q.x - p.x) * t,
    y: p.y + (q.y - p.y) * t,
  }));
}

function curvedRoute(plan: RelPlan): Drawn {
  const pa = portPoint(plan.a);
  const pb = portPoint(plan.b);
  const da = sideDir(plan.a.side);
  const db = sideDir(plan.b.side);
  const S = ROUTING.MARKER_STUB;
  const qa = add(pa, da, S);
  const qb = add(pb, db, S);
  let c1: Point;
  let c2: Point;
  if (da.x === db.x) {
    // Both ends on the same side (stacked tables or a self-loop): bulge outwards.
    const xe = da.x > 0 ? Math.max(qa.x, qb.x) : Math.min(qa.x, qb.x);
    const k = plan.self
      ? ROUTING.SELF_OUT - S + 8
      : 30 + Math.min(80, Math.abs(qa.y - qb.y) * 0.25);
    c1 = { x: xe + da.x * k, y: qa.y };
    c2 = { x: xe + db.x * k, y: qb.y };
  } else {
    const dx = Math.abs(qb.x - qa.x);
    const forward = (qb.x - qa.x) * da.x >= 0;
    const k = forward ? Math.max(30, dx / 2) : Math.max(60, dx / 2 + 40);
    c1 = add(qa, da, k);
    c2 = add(qb, db, k);
  }
  const points: Point[] = [pa, qa];
  for (let i = 1; i < 8; i++) points.push(cubicAt(qa, c1, c2, qb, i / 8));
  points.push(qb, pb);
  const f = (p: Point) => `${fmt(p.x)} ${fmt(p.y)}`;
  return {
    plan,
    pa,
    pb,
    points,
    d: `M${f(pa)}L${f(qa)}C${f(c1)} ${f(c2)} ${f(qb)}L${f(pb)}`,
    candidates: () => [0.5, 0.4, 0.6, 0.3, 0.7].map((t) => cubicAt(qa, c1, c2, qb, t)),
  };
}

function straightRoute(plan: RelPlan): Drawn {
  const pa = portPoint(plan.a);
  const pb = portPoint(plan.b);
  const da = sideDir(plan.a.side);
  const db = sideDir(plan.b.side);
  const S = plan.self ? ROUTING.SELF_OUT : ROUTING.MARKER_STUB;
  let qa = add(pa, da, S);
  let qb = add(pb, db, S);
  if (da.x === db.x && !plan.self) {
    // Same side: run both stubs out to the outermost one so the line clears both tables.
    const xe = da.x > 0 ? Math.max(qa.x, qb.x) : Math.min(qa.x, qb.x);
    qa = { x: xe, y: qa.y };
    qb = { x: xe, y: qb.y };
  }
  const points = simplify([pa, qa, qb, pb]);
  return {
    plan,
    pa,
    pb,
    points,
    d: "",
    // Read the (possibly nudged) middle run lazily.
    candidates: () =>
      points.length >= 4
        ? alongCandidates(points[1], points[points.length - 2])
        : alongCandidates(qa, qb),
  };
}
