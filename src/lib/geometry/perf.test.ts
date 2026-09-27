import { describe, expect, it } from "vitest";
import { clearRouteCache, routeRelationships } from "./index";
import { boxesOf, diagram, rel, table } from "./testUtil";
import type { Relationship, Table } from "@/lib/model";
import { seeded } from "./util";

/** 60 tables / 90 relationships, like a large real diagram. */
function bigDiagram() {
  const rnd = seeded(42);
  const tables: Table[] = [];
  for (let i = 0; i < 60; i++) {
    const gx = i % 10;
    const gy = Math.floor(i / 10);
    tables.push(
      table(
        `t${i}`,
        gx * 320 + Math.floor(rnd() * 40),
        gy * 280 + Math.floor(rnd() * 40),
        2 + (i % 6),
      ),
    );
  }
  const rels: Relationship[] = [];
  for (let i = 0; i < 90; i++) {
    const a = tables[Math.floor(rnd() * 60)];
    // Mostly nearby tables, some long links.
    const j =
      rnd() < 0.8
        ? Math.min(59, Math.max(0, tables.indexOf(a) + [1, -1, 10, -10, 11][Math.floor(rnd() * 5)]))
        : Math.floor(rnd() * 60);
    const b = tables[j];
    rels.push(rel(a, b, { fromCol: a.columns[0].id, toCol: b.columns[1].id }));
  }
  return diagram(tables, rels);
}

describe("routing performance (smoke)", () => {
  it("routes 60 tables / 90 relationships quickly (cold)", () => {
    const d = bigDiagram();
    const boxes = boxesOf(d);
    for (let i = 0; i < 3; i++) {
      clearRouteCache();
      routeRelationships(d, boxes, { style: "orthogonal" }); // warm up the JIT
    }
    const runs = 10;
    let total = 0;
    for (let i = 0; i < runs; i++) {
      clearRouteCache();
      const t0 = performance.now();
      routeRelationships(d, boxes, { style: "orthogonal" });
      total += performance.now() - t0;
    }
    const ms = total / runs;
    expect(ms).toBeLessThan(250);
    console.info(`cold: ${ms.toFixed(1)} ms for 60 tables / 90 rels`);
  });

  it("re-routes quickly while one table is dragged, with identical results", () => {
    const d = bigDiagram();
    clearRouteCache();
    let total = 0;
    const steps = 20;
    let last = new Map<string, string>();
    for (let i = 0; i < steps; i++) {
      const moved = {
        ...d,
        tables: d.tables.map((t, k) => (k === 22 ? { ...t, x: t.x + i * 3, y: t.y + i * 2 } : t)),
      };
      const boxes = boxesOf(moved);
      const t0 = performance.now();
      const routes = routeRelationships(moved, boxes, { style: "orthogonal" });
      total += performance.now() - t0;
      last = new Map(Array.from(routes, ([id, r]) => [id, r.d]));
      if (i === steps - 1) {
        clearRouteCache();
        const fresh = routeRelationships(moved, boxes, { style: "orthogonal" });
        fresh.forEach((r, id) => expect(last.get(id)).toBe(r.d));
      }
    }
    const ms = total / steps;
    expect(ms).toBeLessThan(250);
    console.info(`drag: ${ms.toFixed(1)} ms per frame`);
  });
});
