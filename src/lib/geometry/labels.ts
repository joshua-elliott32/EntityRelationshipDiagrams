import type { Point, Rect } from "./types";
import { rectsOverlap } from "./util";

/**
 * Greedy label placement. Each label brings an ordered list of candidate
 * centres (best first); it takes the first one that overlaps neither an
 * already placed label nor a table, then the first that at least avoids other
 * labels, and finally steps sideways from its best spot.
 */

export interface LabelRequest {
  candidates: Point[];
  w: number;
  h: number;
}

export function placeLabels(items: LabelRequest[], tables: Rect[]): Point[] {
  const placed: Rect[] = [];
  const boxAt = (c: Point, w: number, h: number): Rect => ({
    x: c.x - w / 2,
    y: c.y - h / 2,
    w,
    h,
  });
  const hitsLabel = (r: Rect) => placed.some((p) => rectsOverlap(r, p, 2));
  const hitsTable = (r: Rect) => tables.some((t) => rectsOverlap(r, t, 1));

  return items.map((it) => {
    const { w, h } = it;
    let pick: Point | null = null;
    for (const c of it.candidates) {
      const r = boxAt(c, w, h);
      if (!hitsLabel(r) && !hitsTable(r)) {
        pick = c;
        break;
      }
    }
    if (!pick) pick = it.candidates.find((c) => !hitsLabel(boxAt(c, w, h))) ?? null;
    if (!pick) {
      const base = it.candidates[0];
      pick = base;
      search: for (let m = 1; m <= 6; m++) {
        for (const s of [1, -1]) {
          const c = { x: base.x, y: base.y + s * m * (h + 3) };
          if (!hitsLabel(boxAt(c, w, h))) {
            pick = c;
            break search;
          }
        }
      }
    }
    placed.push(boxAt(pick, w, h));
    return pick;
  });
}
