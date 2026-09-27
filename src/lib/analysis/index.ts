import type { Diagram } from "@/lib/model";
import type { AnalysisOptions, AnalysisResult } from "./types";

export * from "./types";

/**
 * Normalisation and design checks. Pure: same diagram + options → same result.
 * OWNER: analysis subagent. Replace this stub.
 */
export function analyze(d: Diagram, opts: AnalysisOptions): AnalysisResult {
  void d;
  void opts;
  return {
    issues: [],
    highestForm: "BCNF",
    meetsTarget: true,
    byTable: {},
    flaggedColumns: new Set(),
  };
}
