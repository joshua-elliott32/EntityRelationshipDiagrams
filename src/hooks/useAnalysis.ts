"use client";

import { useMemo } from "react";
import { analyze, type AnalysisResult } from "@/lib/analysis";
import { useDiagramStore } from "@/store/diagram";
import { useSettingsStore } from "@/store/settings";

/** The checker's result for the current diagram and settings (memoised). */
export function useAnalysis(): AnalysisResult {
  const tables = useDiagramStore((s) => s.diagram.tables);
  const rels = useDiagramStore((s) => s.diagram.rels);
  const target = useSettingsStore((s) => s.settings.targetNormalForm);
  const heuristics = useSettingsStore((s) => s.settings.showHeuristics);
  const designChecks = useSettingsStore((s) => s.settings.designChecks);
  const naming = useSettingsStore((s) => s.settings.namingConvention);
  return useMemo(
    () =>
      analyze(
        { version: 2, name: "", tables, rels, view: null, updatedAt: 0 },
        { target, heuristics, designChecks, naming },
      ),
    [tables, rels, target, heuristics, designChecks, naming],
  );
}
