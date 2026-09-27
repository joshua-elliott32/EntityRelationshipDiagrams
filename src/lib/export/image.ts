import type { Diagram } from "@/lib/model";
import type { AnalysisResult } from "@/lib/analysis";
import type { Settings } from "@/lib/settings/types";

/**
 * SVG / PNG export of the diagram, drawn with a fixed light "print" palette
 * so exports look the same whatever theme the user is in.
 * OWNER: canvas subagent. Replace these stubs.
 */

export interface ImageExportOptions {
  settings: Settings;
  analysis: AnalysisResult | null;
  /** Draw the yellow issue highlights. */
  includeIssues: boolean;
}

export function toSvgString(d: Diagram, opts: ImageExportOptions): string {
  void d;
  void opts;
  return "";
}

export async function toPngBlob(d: Diagram, opts: ImageExportOptions, scale = 2): Promise<Blob> {
  void d;
  void opts;
  void scale;
  throw new Error("Not implemented");
}
