import type { Diagram, Table } from "@/lib/model";
import type { LayoutOptions, TableBox, TextMeasurer } from "./types";
import { METRICS } from "./types";

/** Room kept in the header for the issue-count badge. */
export const BADGE_W = 34;

/** Rough width estimate when no canvas is available (tests, SSR). */
export const estimateText: TextMeasurer = (text, font) =>
  text.length * (font === "head" ? 7.6 : font === "type" ? 6.7 : font === "label" ? 6.4 : 7.3);

export function tableSize(
  t: Table,
  measure: TextMeasurer,
  opts: LayoutOptions,
): { w: number; h: number } {
  const { PAD_X, KEY_W, TYPE_GAP, MIN_W, HEAD_H, ROW_H } = METRICS;
  let w = PAD_X * 2 + measure(t.name || "untitled", "head") + BADGE_W;
  for (const c of t.columns) {
    let cw = PAD_X * 2 + KEY_W + measure(c.name || "?", "col");
    if (opts.showDataTypes && c.type) cw += TYPE_GAP + measure(c.type, "type");
    if (cw > w) w = cw;
  }
  w = Math.ceil(Math.max(MIN_W, w) / 2) * 2;
  return { w, h: HEAD_H + Math.max(1, t.columns.length) * ROW_H };
}

/** World Y of the centre line of column row `i` for a table whose top is `top`. */
export function rowCentre(top: number, i: number): number {
  return top + METRICS.HEAD_H + i * METRICS.ROW_H + METRICS.ROW_H / 2;
}

/** Lay out every table. */
export function layoutTables(
  d: Diagram,
  measure: TextMeasurer,
  opts: LayoutOptions,
): Map<string, TableBox> {
  const out = new Map<string, TableBox>();
  for (const t of d.tables) {
    const { w, h } = tableSize(t, measure, opts);
    const rowY: Record<string, number> = {};
    t.columns.forEach((c, i) => (rowY[c.id] = rowCentre(t.y, i)));
    out.set(t.id, { id: t.id, x: t.x, y: t.y, w, h, rowY });
  }
  return out;
}
