"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Route, TableBox } from "@/lib/geometry";
import { computeLayout } from "@/components/canvas/stableLayout";
import {
  createCanvasMeasurer,
  getMeasureVersion,
  sharedMeasurer,
  subscribeMeasure,
} from "@/components/canvas/measure";
import { useDiagramStore } from "@/store/diagram";
import { useSettingsStore } from "@/store/settings";

export { createCanvasMeasurer };

/**
 * World-space table boxes and routed relationship lines for the current
 * diagram, measured with the real canvas fonts. Re-computed when tables,
 * relationships, the relevant settings or the loaded fonts change — not when
 * the camera moves. Unchanged boxes/routes keep their identity.
 */
export function useLayout(): { boxes: Map<string, TableBox>; routes: Map<string, Route> } {
  const tables = useDiagramStore((s) => s.diagram.tables);
  const rels = useDiagramStore((s) => s.diagram.rels);
  const showDataTypes = useSettingsStore((s) => s.settings.showDataTypes);
  const lineStyle = useSettingsStore((s) => s.settings.lineStyle);
  const version = useSyncExternalStore(subscribeMeasure, getMeasureVersion, getMeasureVersion);
  return useMemo(() => {
    void version; // fonts loaded: the shared measurer has dropped its cache
    return computeLayout(tables, rels, sharedMeasurer(), { showDataTypes, lineStyle });
  }, [tables, rels, showDataTypes, lineStyle, version]);
}
