import type { LineStyle, Notation } from "@/lib/settings/types";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = "left" | "right" | "top" | "bottom";

/** Fonts used on the canvas; the measurer maps each to a real CSS font. */
export type FontKind = "head" | "col" | "type" | "key" | "label";

/** Returns the rendered width in px of `text` in the given font. */
export type TextMeasurer = (text: string, font: FontKind) => number;

/** Fixed table metrics shared by the renderer and the router. */
export const METRICS = {
  HEAD_H: 34,
  ROW_H: 24,
  PAD_X: 12,
  /** Room reserved for the PK/FK badge before the column name. */
  KEY_W: 42,
  /** Gap between column name and data type. */
  TYPE_GAP: 18,
  MIN_W: 180,
} as const;

/** A laid-out table: world-space rectangle plus the Y centre of each column row. */
export interface TableBox extends Rect {
  id: string;
  /** Column id → world Y of that row's centre line. */
  rowY: Record<string, number>;
}

export interface LayoutOptions {
  showDataTypes: boolean;
}

/** One end of a routed relationship line. */
export interface RouteEnd {
  /** Where the line meets the table border. */
  point: Point;
  /** Unit vector pointing away from the table (the direction the line leaves in). */
  dir: Point;
  side: Side;
}

export interface Route {
  relId: string;
  /** SVG path `d` for the connector itself (no markers). */
  d: string;
  /** Polyline through the route's corners (useful for hit tests and tests). */
  points: Point[];
  /** End attached to `rel.from` (the parent / "one" side). */
  start: RouteEnd;
  /** End attached to `rel.to` (the child / FK side). */
  end: RouteEnd;
  /** Centre for the label pill, on the longest clear segment. */
  labelAt: Point;
}

export interface RouteOptions {
  style: LineStyle;
}

/** Marker drawn at one end of a line. */
export interface EndKind {
  /** Maximum cardinality at this end. */
  max: "one" | "many";
  /** Minimum cardinality zero. */
  optional: boolean;
}

export type { LineStyle, Notation };
