import { describe, expect, it } from "vitest";
import { makeColumn, makeTable } from "@/lib/model";
import { BADGE_W, estimateText, layoutTables, tableSize } from "./measure";
import { METRICS } from "./types";
import { diagram } from "./testUtil";

const fixed = (text: string) => text.length * 10;

describe("tableSize", () => {
  it("never goes below the minimum and rounds up to an even width", () => {
    const t = makeTable("a", 0, 0);
    expect(tableSize(t, estimateText, { showDataTypes: true })).toEqual({
      w: METRICS.MIN_W,
      h: METRICS.HEAD_H + METRICS.ROW_H,
    });
    const long = makeTable("x".repeat(31), 0, 0);
    const { w } = tableSize(long, fixed, { showDataTypes: true });
    expect(w % 2).toBe(0);
    expect(w).toBe(Math.ceil((METRICS.PAD_X * 2 + 310 + BADGE_W) / 2) * 2);
  });

  it("measures columns, with and without data types", () => {
    const t = makeTable("t", 0, 0, {
      columns: [makeColumn("a_long_column_name", "VARCHAR(255)"), makeColumn("b", "INT")],
    });
    const withTypes = tableSize(t, fixed, { showDataTypes: true });
    const noTypes = tableSize(t, fixed, { showDataTypes: false });
    const { PAD_X, KEY_W, TYPE_GAP } = METRICS;
    expect(withTypes.w).toBe(PAD_X * 2 + KEY_W + 180 + TYPE_GAP + 120);
    expect(noTypes.w).toBe(Math.max(METRICS.MIN_W, PAD_X * 2 + KEY_W + 180));
    expect(withTypes.h).toBe(METRICS.HEAD_H + 2 * METRICS.ROW_H);
  });
});

describe("layoutTables", () => {
  it("gives each column row's centre line", () => {
    const t = makeTable("t", 10, 100, { columns: [makeColumn("a"), makeColumn("b")] });
    const box = layoutTables(diagram([t], []), estimateText, { showDataTypes: true }).get(t.id)!;
    expect(box.rowY[t.columns[0].id]).toBe(100 + METRICS.HEAD_H + METRICS.ROW_H / 2);
    expect(box.rowY[t.columns[1].id]).toBe(100 + METRICS.HEAD_H + METRICS.ROW_H * 1.5);
    expect(box).toMatchObject({ x: 10, y: 100 });
  });
});
