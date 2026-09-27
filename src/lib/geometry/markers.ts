import type { Relationship } from "@/lib/model";
import type { EndKind, Notation, Point, RouteEnd } from "./types";
import { fmt } from "./util";

/**
 * Crow's-foot markers, drawn along the straight run where a line leaves a
 * table. Along the line (distance from the table edge):
 *
 *   many:  foot 0–14 (prongs meet on the line at 14), then bar at 18 or circle 16–24
 *   one:   bar at 10, then a second bar at 16 or a circle 15–23
 *
 * Every piece is its own subpath, so only circles enclose area: a renderer can
 * fill the path with the background colour to get hollow circles over the line.
 */

export const MARKER = {
  /** Half the length of a bar / half the spread of the foot at the table edge. */
  HALF: 7,
  FOOT_LEN: 14,
  FOOT_SPREAD: 8,
  CIRCLE_R: 4,
} as const;

/** The two end kinds for a relationship: [at `from`, at `to`]. */
export function endKinds(r: Relationship): [EndKind, EndKind] {
  const fromMax = r.type === "N:M" ? "many" : "one";
  const toMax = r.type === "1:1" ? "one" : "many";
  return [
    { max: fromMax, optional: r.fromOptional },
    { max: toMax, optional: r.toOptional },
  ];
}

/** SVG path `d` for the marker at one end (crow's foot), or "" for numeric notation. */
export function markerPath(end: RouteEnd, kind: EndKind, notation: Notation): string {
  if (notation !== "crowsfoot") return "";
  const p = end.point;
  const len = Math.hypot(end.dir.x, end.dir.y) || 1;
  const u = { x: end.dir.x / len, y: end.dir.y / len };
  const n = { x: -u.y, y: u.x };
  const P = (a: number, b: number) =>
    `${fmt(p.x + u.x * a + n.x * b)} ${fmt(p.y + u.y * a + n.y * b)}`;
  const bar = (a: number) => `M${P(a, -MARKER.HALF)}L${P(a, MARKER.HALF)}`;
  const circle = (a: number) => {
    const r = MARKER.CIRCLE_R;
    return `M${P(a - r, 0)}A${r} ${r} 0 1 0 ${P(a + r, 0)}A${r} ${r} 0 1 0 ${P(a - r, 0)}`;
  };
  const r = MARKER.CIRCLE_R;
  if (kind.max === "one") {
    return kind.optional ? bar(10) + circle(15 + r) : bar(10) + bar(16);
  }
  const F = MARKER.FOOT_LEN;
  const s = MARKER.FOOT_SPREAD;
  const foot = `M${P(F, 0)}L${P(0, -s)}M${P(F, 0)}L${P(0, 0)}M${P(F, 0)}L${P(0, s)}`;
  return kind.optional ? foot + circle(F + 2 + r) : foot + bar(F + 4);
}

/** Text for numeric notation: "1", "0..1", "N" or "0..N". */
export function endText(kind: EndKind): string {
  if (kind.max === "one") return kind.optional ? "0..1" : "1";
  return kind.optional ? "0..N" : "N";
}

/**
 * Where to centre the numeric end text: just outside the table, beside the
 * line (above a horizontal line, right of a vertical one) so it never sits on it.
 */
export function endTextAt(end: RouteEnd): Point {
  const len = Math.hypot(end.dir.x, end.dir.y) || 1;
  const u = { x: end.dir.x / len, y: end.dir.y / len };
  const horizontal = Math.abs(u.x) >= Math.abs(u.y);
  const along = 14;
  const side = 10;
  return {
    x: end.point.x + u.x * along + (horizontal ? 0 : side),
    y: end.point.y + u.y * along - (horizontal ? side : 0),
  };
}
