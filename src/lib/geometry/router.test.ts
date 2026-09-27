import { describe, expect, it } from "vitest";
import { ROUTING } from "./constants";
import { diagramBounds, routeRelationships } from "./index";
import { boxesOf, diagram, hits, rel, segments, table } from "./testUtil";
import type { Diagram, Table } from "@/lib/model";
import type { Point, Route, TableBox } from "./types";
import { seeded } from "./util";

const ortho = { style: "orthogonal" } as const;

function stubLen(r: Route, which: "start" | "end"): number {
  const pts = which === "start" ? r.points : r.points.slice().reverse();
  return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
}

function isOrthogonal(points: Point[]): boolean {
  return segments(points).every(
    ([a, b]) => Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6,
  );
}

/** Check a route leaves each table perpendicular, from its side, with a long enough stub. */
function expectGoodEnds(r: Route, a: TableBox, b: TableBox) {
  for (const [e, box, which] of [
    [r.start, a, "start"],
    [r.end, b, "end"],
  ] as const) {
    const pts = which === "start" ? r.points : r.points.slice().reverse();
    expect(pts[0]).toEqual(e.point);
    const onLeft = Math.abs(e.point.x - box.x) < 1e-6;
    const onRight = Math.abs(e.point.x - (box.x + box.w)) < 1e-6;
    expect(onLeft || onRight).toBe(true);
    expect(e.dir).toEqual({ x: onRight ? 1 : -1, y: 0 });
    expect(e.point.y).toBeGreaterThan(box.y);
    expect(e.point.y).toBeLessThan(box.y + box.h);
    // First segment runs along dir.
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    expect(Math.abs(dy)).toBeLessThan(1e-6);
    expect(Math.sign(dx)).toBe(e.dir.x);
    expect(stubLen(r, which)).toBeGreaterThanOrEqual(ROUTING.MARKER_STUB - 1e-6);
  }
}

describe("routeRelationships — side choice", () => {
  it("A left of B → A.right to B.left, attached at the column rows", () => {
    const a = table("a", 0, 0);
    const b = table("b", 500, 100);
    const r = rel(a, b, { fromCol: a.columns[0].id, toCol: b.columns[2].id });
    const d = diagram([a, b], [r]);
    const boxes = boxesOf(d);
    const route = routeRelationships(d, boxes, ortho).get(r.id)!;
    expect(route.start.side).toBe("right");
    expect(route.end.side).toBe("left");
    expect(route.start.point.y).toBe(boxes.get(a.id)!.rowY[a.columns[0].id]);
    expect(route.end.point.y).toBe(boxes.get(b.id)!.rowY[b.columns[2].id]);
    expectGoodEnds(route, boxes.get(a.id)!, boxes.get(b.id)!);
    expect(isOrthogonal(route.points)).toBe(true);
    // A simple Z: at most 2 bends.
    expect(route.points.length).toBeLessThanOrEqual(4);
  });

  it("B left of A → A.left to B.right", () => {
    const a = table("a", 600, 0);
    const b = table("b", 0, 40);
    const r = rel(a, b);
    const d = diagram([a, b], [r]);
    const boxes = boxesOf(d);
    const route = routeRelationships(d, boxes, ortho).get(r.id)!;
    expect(route.start.side).toBe("left");
    expect(route.end.side).toBe("right");
    expectGoodEnds(route, boxes.get(a.id)!, boxes.get(b.id)!);
  });

  it("unset columns attach at the header centre", () => {
    const a = table("a", 0, 0);
    const b = table("b", 500, 200);
    const r = rel(a, b);
    const d = diagram([a, b], [r]);
    const route = routeRelationships(d, boxesOf(d), ortho).get(r.id)!;
    expect(route.start.point.y).toBe(17);
    expect(route.end.point.y).toBe(217);
  });

  it("aligned rows give a single straight segment", () => {
    const a = table("a", 0, 0);
    const b = table("b", 400, 0);
    const r = rel(a, b, { fromCol: a.columns[0].id, toCol: b.columns[0].id });
    const d = diagram([a, b], [r]);
    const route = routeRelationships(d, boxesOf(d), ortho).get(r.id)!;
    expect(route.points).toHaveLength(2);
  });

  it("stacked tables attach on the same side (bracket shape)", () => {
    const a = table("a", 0, 0);
    const b = table("b", 20, 300);
    const r = rel(a, b, { fromCol: a.columns[0].id, toCol: b.columns[1].id });
    const d = diagram([a, b], [r]);
    const boxes = boxesOf(d);
    const route = routeRelationships(d, boxes, ortho).get(r.id)!;
    expect(route.start.side).toBe(route.end.side);
    expectGoodEnds(route, boxes.get(a.id)!, boxes.get(b.id)!);
    expect(route.points.length).toBe(4);
    // Never through either table.
    const inner = route.points.slice(1, -1);
    expect(hits(inner, boxes.get(a.id)!)).toBe(false);
    expect(hits(inner, boxes.get(b.id)!)).toBe(false);
  });

  it("overlapping tables still attach at the sides, never centre to centre", () => {
    const a = table("a", 0, 0);
    const b = table("b", 60, 40);
    const r = rel(a, b);
    const d = diagram([a, b], [r]);
    const boxes = boxesOf(d);
    const route = routeRelationships(d, boxes, ortho).get(r.id)!;
    expectGoodEnds(route, boxes.get(a.id)!, boxes.get(b.id)!);
    expect(isOrthogonal(route.points)).toBe(true);
  });
});

describe("routeRelationships — obstacle avoidance", () => {
  it("goes around a table sitting between the two ends", () => {
    const a = table("a", 0, 100);
    const mid = table("mid", 350, 60, 8);
    const b = table("b", 700, 100);
    const r = rel(a, b, { fromCol: a.columns[1].id, toCol: b.columns[1].id });
    const d = diagram([a, mid, b], [r]);
    const boxes = boxesOf(d);
    const route = routeRelationships(d, boxes, ortho).get(r.id)!;
    expect(hits(route.points, boxes.get(mid.id)!)).toBe(false);
    expectGoodEnds(route, boxes.get(a.id)!, boxes.get(b.id)!);
  });

  function randomLayout(seed: number): Diagram {
    const rnd = seeded(seed);
    const tables: Table[] = [];
    // Scatter on a jittered grid so tables never overlap and keep ≥ 60px gaps.
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (rnd() < 0.2) continue;
        const cols = 1 + Math.floor(rnd() * 7);
        tables.push(
          table(
            `t${gx}${gy}`,
            gx * 330 + Math.floor(rnd() * 60),
            gy * 300 + Math.floor(rnd() * 40),
            cols,
          ),
        );
      }
    }
    const rels = [];
    for (let i = 0; i < tables.length * 1.5; i++) {
      const a = tables[Math.floor(rnd() * tables.length)];
      const b = tables[Math.floor(rnd() * tables.length)];
      const pickCol = (t: Table) =>
        rnd() < 0.25 ? "" : t.columns[Math.floor(rnd() * t.columns.length)].id;
      rels.push(rel(a, b, { fromCol: pickCol(a), toCol: pickCol(b) }));
    }
    return diagram(tables, rels);
  }

  it.each([1, 2, 3, 4, 5, 6, 7, 8])("no segment crosses a table (seed %i)", (seed) => {
    const d = randomLayout(seed);
    const boxes = boxesOf(d);
    const routes = routeRelationships(d, boxes, ortho);
    for (const r of d.rels) {
      const route = routes.get(r.id)!;
      expect(isOrthogonal(route.points)).toBe(true);
      const A = boxes.get(r.from)!;
      const B = boxes.get(r.to)!;
      expectGoodEnds(route, A, B);
      boxes.forEach((box) => {
        if (box.id === r.from || box.id === r.to) {
          // The endpoint tables are only touched at the ports.
          expect(hits(route.points.slice(1, -1), box)).toBe(false);
        } else {
          expect(hits(route.points, box), `${r.id} crosses ${box.id}`).toBe(false);
        }
      });
    }
  });
});

describe("routeRelationships — overlap avoidance", () => {
  it("parallel relationships between the same pair get distinct paths", () => {
    const a = table("a", 0, 0);
    const b = table("b", 500, 150);
    const r1 = rel(a, b);
    const r2 = rel(a, b);
    const r3 = rel(a, b);
    const d = diagram([a, b], [r1, r2, r3]);
    const routes = routeRelationships(d, boxesOf(d), ortho);
    const ds = [r1, r2, r3].map((r) => routes.get(r.id)!.d);
    expect(new Set(ds).size).toBe(3);
    const ys = [r1, r2, r3].map((r) => routes.get(r.id)!.start.point.y);
    expect(new Set(ys).size).toBe(3);
    // Still inside the header band.
    for (const y of ys) {
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(34);
    }
    // No two routes share a collinear overlapping segment.
    const segs = [r1, r2, r3].map((r) => segments(routes.get(r.id)!.points));
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        for (const [p, q] of segs[i]) {
          for (const [s, t] of segs[j]) {
            const vert = p.x === q.x && s.x === t.x && Math.abs(p.x - s.x) < 1;
            const horiz = p.y === q.y && s.y === t.y && Math.abs(p.y - s.y) < 1;
            if (vert) {
              const o =
                Math.min(Math.max(p.y, q.y), Math.max(s.y, t.y)) -
                Math.max(Math.min(p.y, q.y), Math.min(s.y, t.y));
              expect(o).toBeLessThan(1);
            }
            if (horiz) {
              const o =
                Math.min(Math.max(p.x, q.x), Math.max(s.x, t.x)) -
                Math.max(Math.min(p.x, q.x), Math.min(s.x, t.x));
              expect(o).toBeLessThan(1);
            }
          }
        }
      }
    }
  });

  it("several foreign keys into the same column fan out within the row", () => {
    const p = table("p", 500, 0);
    const c1 = table("c1", 0, 0);
    const c2 = table("c2", 0, 250);
    const pk = p.columns[0].id;
    const r1 = rel(p, c1, { fromCol: pk, toCol: c1.columns[1].id });
    const r2 = rel(p, c2, { fromCol: pk, toCol: c2.columns[1].id });
    const d = diagram([p, c1, c2], [r1, r2]);
    const boxes = boxesOf(d);
    const routes = routeRelationships(d, boxes, ortho);
    const y1 = routes.get(r1.id)!.start.point.y;
    const y2 = routes.get(r2.id)!.start.point.y;
    const row = boxes.get(p.id)!.rowY[pk];
    expect(y1).not.toBe(y2);
    // Upper target keeps the upper port so the lines don't cross.
    expect(y1).toBeLessThan(y2);
    for (const y of [y1, y2]) expect(Math.abs(y - row)).toBeLessThanOrEqual(8);
  });

  it("labels of parallel relationships don't overlap", () => {
    const a = table("a", 0, 0);
    const b = table("b", 500, 0);
    const rs = [rel(a, b, { label: "one" }), rel(a, b, { label: "two" })];
    const d = diagram([a, b], rs);
    const routes = routeRelationships(d, boxesOf(d), ortho);
    const [l1, l2] = rs.map((r) => routes.get(r.id)!.labelAt);
    const apart = Math.abs(l1.x - l2.x) > 60 || Math.abs(l1.y - l2.y) >= ROUTING.LABEL_H;
    expect(apart).toBe(true);
  });
});

describe("routeRelationships — self-links", () => {
  it("loops out of the right side between two distinct rows", () => {
    const t = table("emp", 100, 100, 5);
    const r = rel(t, t, { fromCol: t.columns[0].id, toCol: t.columns[3].id });
    const d = diagram([t], [r]);
    const boxes = boxesOf(d);
    const box = boxes.get(t.id)!;
    const route = routeRelationships(d, boxes, ortho).get(r.id)!;
    expect(route.start.side).toBe("right");
    expect(route.end.side).toBe("right");
    expect(route.start.point.y).toBe(box.rowY[t.columns[0].id]);
    expect(route.end.point.y).toBe(box.rowY[t.columns[3].id]);
    expect(route.points).toHaveLength(4);
    const out = route.points[1].x - (box.x + box.w);
    expect(out).toBeGreaterThanOrEqual(32);
    expect(out).toBeLessThanOrEqual(56);
    expect(route.points[1].x).toBe(route.points[2].x);
  });

  it("picks a nearby row when both ends would coincide", () => {
    const t = table("emp", 0, 0, 3);
    const r1 = rel(t, t);
    const r2 = rel(t, t, { fromCol: t.columns[1].id, toCol: t.columns[1].id });
    const d = diagram([t], [r1, r2]);
    const routes = routeRelationships(d, boxesOf(d), ortho);
    for (const r of [r1, r2]) {
      const route = routes.get(r.id)!;
      expect(Math.abs(route.start.point.y - route.end.point.y)).toBeGreaterThanOrEqual(
        ROUTING.SELF_MIN_DY - 6,
      );
    }
  });

  it("bounds include the loop", () => {
    const t = table("emp", 0, 0, 3);
    const r = rel(t, t);
    const d = diagram([t], [r]);
    const boxes = boxesOf(d);
    const routes = routeRelationships(d, boxes, ortho);
    const b = diagramBounds(boxes, routes);
    expect(b.x + b.w).toBeGreaterThanOrEqual(boxes.get(t.id)!.w + 32);
  });
});

describe("routeRelationships — curved and straight", () => {
  for (const style of ["curved", "straight"] as const) {
    it(`${style}: side-attached with straight stubs`, () => {
      const a = table("a", 0, 0);
      const b = table("b", 500, 200);
      const s = table("s", 0, 400);
      const r1 = rel(a, b, { fromCol: a.columns[0].id, toCol: b.columns[1].id });
      const r2 = rel(a, s);
      const r3 = rel(s, s);
      const d = diagram([a, b, s], [r1, r2, r3]);
      const boxes = boxesOf(d);
      const routes = routeRelationships(d, boxes, { style });
      for (const r of [r1, r2, r3]) {
        const route = routes.get(r.id)!;
        expect(route.d.startsWith("M")).toBe(true);
        if (style === "curved") expect(route.d).toContain("C");
        expectGoodEnds(route, boxes.get(r.from)!, boxes.get(r.to)!);
      }
      expect(routes.get(r2.id)!.start.side).toBe(routes.get(r2.id)!.end.side);
    });
  }
});

describe("routeRelationships — output", () => {
  it("renders rounded corners and skips relationships with missing tables", () => {
    const a = table("a", 0, 0);
    const b = table("b", 500, 200);
    const r = rel(a, b, { fromCol: a.columns[0].id, toCol: b.columns[1].id });
    const ghost = { ...rel(a, b), to: "missing" };
    const d = diagram([a, b], [r, ghost]);
    const routes = routeRelationships(d, boxesOf(d), ortho);
    expect(routes.has(ghost.id)).toBe(false);
    expect(routes.get(r.id)!.d).toMatch(/Q/);
    expect(routes.get(r.id)!.d).not.toMatch(/NaN/);
  });

  it("puts the label on the longest segment", () => {
    const a = table("a", 0, 0);
    const b = table("b", 800, 0);
    const r = rel(a, b, { fromCol: a.columns[0].id, toCol: b.columns[3].id });
    const d = diagram([a, b], [r]);
    const route = routeRelationships(d, boxesOf(d), ortho).get(r.id)!;
    const segs = segments(route.points).sort(
      (p, q) =>
        Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) - Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y),
    );
    const [p, q] = segs[0];
    const onSeg =
      Math.abs(p.y - q.y) < 1e-6
        ? Math.abs(route.labelAt.y - p.y) < 1e-6
        : Math.abs(route.labelAt.x - p.x) < 1e-6;
    expect(onSeg).toBe(true);
  });
});
