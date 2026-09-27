import { describe, expect, it } from "vitest";
import type { Diagram } from "@/lib/model";
import { autoLayout } from "./autoLayout";
import { boxesOf, diagram, rel, table } from "./testUtil";
import { rectsOverlap, seeded } from "./util";

function apply(d: Diagram) {
  const boxes = boxesOf(d);
  const pos = autoLayout(d, boxes);
  return { boxes, pos };
}

function expectNoOverlap(d: Diagram) {
  const { boxes, pos } = apply(d);
  expect(pos.size).toBe(d.tables.length);
  const rects = d.tables.map((t) => ({ ...boxes.get(t.id)!, ...pos.get(t.id)! }));
  for (let i = 0; i < rects.length; i++) {
    expect(rects[i].x % 10).toBe(0);
    expect(rects[i].y % 10).toBe(0);
    for (let j = i + 1; j < rects.length; j++) {
      expect(rectsOverlap(rects[i], rects[j], 20), `${i} vs ${j}`).toBe(false);
    }
  }
}

describe("autoLayout", () => {
  it("puts parents left of children in a chain", () => {
    const a = table("a", 500, 500);
    const b = table("b", 0, 0);
    const c = table("c", 200, 900);
    const d = diagram([c, b, a], [rel(a, b), rel(b, c)]);
    const { boxes, pos } = apply(d);
    const pa = pos.get(a.id)!;
    const pb = pos.get(b.id)!;
    const pc = pos.get(c.id)!;
    expect(pa.x + boxes.get(a.id)!.w).toBeLessThan(pb.x);
    expect(pb.x + boxes.get(b.id)!.w).toBeLessThan(pc.x);
    // A straight chain lines up.
    expect(pa.y).toBe(pb.y);
    expect(pb.y).toBe(pc.y);
  });

  it("is deterministic and handles cycles, self-links and lone tables", () => {
    const a = table("a", 0, 0);
    const b = table("b", 10, 10);
    const c = table("c", 20, 20);
    const lone1 = table("lone1", 30, 30);
    const lone2 = table("lone2", 40, 40);
    const d = diagram(
      [a, b, c, lone1, lone2],
      [rel(a, b), rel(b, c), rel(c, a), rel(a, a), rel(lone1, lone1)],
    );
    expectNoOverlap(d);
    expect(apply(d).pos).toEqual(apply(d).pos);
    const { pos } = apply(d);
    // Lone tables sit below the connected component.
    const compBottom = Math.max(...[a, b, c].map((t) => pos.get(t.id)!.y));
    expect(pos.get(lone1.id)!.y).toBeGreaterThan(compBottom);
  });

  it.each([1, 2, 3, 4, 5])("never overlaps (random seed %i)", (seed) => {
    const rnd = seeded(seed);
    const tables = Array.from({ length: 25 }, (_, i) =>
      table(`t${i}`, Math.floor(rnd() * 800), Math.floor(rnd() * 800), 1 + Math.floor(rnd() * 8)),
    );
    const rels = Array.from({ length: 30 }, () =>
      rel(tables[Math.floor(rnd() * 25)], tables[Math.floor(rnd() * 25)]),
    );
    expectNoOverlap(diagram(tables, rels));
  });

  it("returns nothing for an empty diagram", () => {
    expect(autoLayout(diagram([], []), new Map()).size).toBe(0);
  });
});
