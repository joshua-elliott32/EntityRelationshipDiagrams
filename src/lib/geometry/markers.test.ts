import { describe, expect, it } from "vitest";
import { makeRelationship } from "@/lib/model";
import { endKinds, endText, endTextAt, markerPath, MARKER } from "./markers";
import type { EndKind, RouteEnd } from "./types";

const right: RouteEnd = { point: { x: 100, y: 50 }, dir: { x: 1, y: 0 }, side: "right" };
const left: RouteEnd = { point: { x: 0, y: 50 }, dir: { x: -1, y: 0 }, side: "left" };

const kinds: [string, EndKind][] = [
  ["exactly one", { max: "one", optional: false }],
  ["zero or one", { max: "one", optional: true }],
  ["one or many", { max: "many", optional: false }],
  ["zero or many", { max: "many", optional: true }],
];

/** All coordinates in a path (pairs after M/L/A end points). */
function xs(d: string): number[] {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  return nums;
}

describe("markerPath", () => {
  it.each(kinds)("%s: non-empty crow's foot path", (_, kind) => {
    const d = markerPath(right, kind, "crowsfoot");
    expect(d.length).toBeGreaterThan(10);
    expect(d).toMatch(/^M/);
    expect(d).not.toMatch(/NaN/);
    const circles = (d.match(/A/g) ?? []).length;
    expect(circles).toBe(kind.optional ? 2 : 0);
  });

  it.each(kinds)("%s: numeric notation draws nothing", (_, kind) => {
    expect(markerPath(right, kind, "numeric")).toBe("");
  });

  it("stays outside the table on the line's straight run", () => {
    for (const [, kind] of kinds) {
      const d = markerPath(right, kind, "crowsfoot");
      // x values sit at or right of the table edge and within the 24px stub.
      const nums = xs(d);
      const pts: number[] = [];
      d.replace(/[ML](-?[\d.]+) (-?[\d.]+)/g, (_m, x) => {
        pts.push(Number(x));
        return "";
      });
      for (const x of pts) {
        expect(x).toBeGreaterThanOrEqual(100 - 1e-6);
        expect(x).toBeLessThanOrEqual(124.01);
      }
      expect(nums.length).toBeGreaterThan(0);
    }
  });

  it("mirrors for the left side", () => {
    const d = markerPath(left, { max: "many", optional: false }, "crowsfoot");
    const pts: number[] = [];
    d.replace(/[ML](-?[\d.]+) (-?[\d.]+)/g, (_m, x) => {
      pts.push(Number(x));
      return "";
    });
    for (const x of pts) expect(x).toBeLessThanOrEqual(0);
    // The foot spreads at the table edge.
    expect(d).toContain(`L0 ${50 - MARKER.FOOT_SPREAD}`);
  });

  it("circle and bar/foot do not overlap", () => {
    const d = markerPath(right, { max: "many", optional: true }, "crowsfoot");
    const circleStart = Number(/M(-?[\d.]+) 50A/.exec(d)![1]);
    expect(circleStart - 100).toBeGreaterThan(MARKER.FOOT_LEN);
    const d1 = markerPath(right, { max: "one", optional: true }, "crowsfoot");
    const c1 = Number(/M(-?[\d.]+) 50A/.exec(d1)![1]);
    expect(c1 - 100).toBeGreaterThan(10);
  });
});

describe("endKinds / endText / endTextAt", () => {
  it("maps cardinality to end kinds", () => {
    const r = makeRelationship("a", "b", { type: "1:N", fromOptional: false, toOptional: true });
    expect(endKinds(r)).toEqual([
      { max: "one", optional: false },
      { max: "many", optional: true },
    ]);
    expect(endKinds({ ...r, type: "N:M" })[0].max).toBe("many");
    expect(endKinds({ ...r, type: "1:1" })[1].max).toBe("one");
  });

  it("texts", () => {
    expect(kinds.map(([, k]) => endText(k))).toEqual(["1", "0..1", "N", "0..N"]);
  });

  it("puts the text just outside the end, beside the line", () => {
    const p = endTextAt(right);
    expect(p.x).toBeGreaterThan(100);
    expect(p.y).toBeLessThan(50);
    const q = endTextAt(left);
    expect(q.x).toBeLessThan(0);
    expect(q.y).toBeLessThan(50);
    const down = endTextAt({ point: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, side: "bottom" });
    expect(down.y).toBeGreaterThan(0);
    expect(down.x).not.toBe(0);
  });
});
