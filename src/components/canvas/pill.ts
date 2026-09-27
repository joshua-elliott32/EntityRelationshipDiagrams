import type { TextMeasurer } from "@/lib/geometry";
import type { Relationship } from "@/lib/model";

/** Relationship label pill: text and size, shared by the renderer and the router. */

export const PILL_H = 18;

/** Text shown in a relationship's pill: its label, or the cardinality when unlabelled. */
export function pillText(r: Relationship): string {
  return r.label.trim() || r.type;
}

export function pillWidth(r: Relationship, measure: TextMeasurer): number {
  return Math.ceil(measure(pillText(r), "label")) + 16;
}
