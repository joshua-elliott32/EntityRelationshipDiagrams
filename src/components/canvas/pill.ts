import type { TextMeasurer } from "@/lib/geometry";
import type { Relationship } from "@/lib/model";

/** Relationship label pill: text and size, shared by the renderer and the router. */

export const PILL_H = 18;

/**
 * Text shown in a relationship's pill: its label, or "" for no pill. The line
 * ends already show cardinality (crow's foot or 1/N), so an unlabelled
 * relationship doesn't need a "1:N" pill cluttering the channel.
 */
export function pillText(r: Relationship): string {
  return r.label.trim();
}

/** Pill width, or 0 when the relationship has no label. */
export function pillWidth(r: Relationship, measure: TextMeasurer): number {
  const text = pillText(r);
  return text ? Math.ceil(measure(text, "label")) + 16 : 0;
}
